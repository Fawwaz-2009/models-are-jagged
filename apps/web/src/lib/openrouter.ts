import type { ModelApi, ModelInfo } from "./types.ts";

const BASE = "https://openrouter.ai/api/v1";

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

interface OpenRouterError {
  error?: { message?: string; code?: number | string };
  message?: string;
}

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      images?: Array<{ type?: string; image_url?: { url?: string } | string; url?: string }>;
    };
  }>;
}

interface ModelsResponse {
  data?: Array<{
    id?: string;
    name?: string;
    created?: number;
    architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  }>;
}

interface ImageModelsResponse {
  data?: Array<{
    id?: string;
    name?: string;
    created?: number;
    architecture?: { input_modalities?: string[]; output_modalities?: string[] };
    supported_parameters?: {
      aspect_ratio?: unknown;
      input_references?: unknown;
      output_format?: unknown;
    };
  }>;
}

interface ImagesResponse {
  data?: Array<{
    b64_json?: string;
    media_type?: string;
    url?: string;
  }>;
}

const request = async (path: string, init: RequestInit): Promise<Response> => {
  const response = await fetch(`${BASE}${path}`, init);
  if (!response.ok) {
    let message = `OpenRouter answered ${response.status}.`;
    try {
      const body = (await response.json()) as OpenRouterError;
      message = body.error?.message ?? body.message ?? message;
    } catch {
      // The status is still useful when the body is not JSON.
    }
    throw new Error(message);
  }
  return response;
};

const authHeaders = (apiKey: string): HeadersInit => ({
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
});

type ChatMessageView = NonNullable<NonNullable<ChatResponse["choices"]>[number]["message"]>;
const contentText = (content: ChatMessageView["content"] | undefined): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part.text === "string" ? part.text : "")).join("\n");
  return "";
};

const extractError = (error: unknown): string => (error instanceof Error ? error.message : "Something went wrong talking to OpenRouter.");

const orderModels = (models: ModelInfo[]): ModelInfo[] =>
  models.sort((a, b) => {
    const created = (b.created ?? 0) - (a.created ?? 0);
    return created !== 0 ? created : a.name.localeCompare(b.name);
  });

export const fetchModels = async (signal?: AbortSignal): Promise<ModelInfo[]> => {
  const chatRequest = request("/models", {
    method: "GET",
    signal,
  }).then(async (response) => (await response.json()) as ModelsResponse);
  const imageRequest = request("/images/models", {
    method: "GET",
    signal,
  })
    .then(async (response) => (await response.json()) as ImageModelsResponse)
    .catch(() => ({ data: [] }) as ImageModelsResponse);
  const [chatBody, imageBody] = await Promise.all([chatRequest, imageRequest]);

  const chatModels: ModelInfo[] = (chatBody.data ?? [])
    .filter((model): model is NonNullable<ModelsResponse["data"]>[number] & { id: string } => typeof model.id === "string")
    .filter((model) => !model.id.includes(":batch") && !model.id.startsWith("openrouter/"))
    .map((model) => ({
      id: model.id,
      name: model.name?.trim() || model.id,
      created: typeof model.created === "number" ? model.created : null,
      outputModalities: model.architecture?.output_modalities ?? [],
      inputModalities: model.architecture?.input_modalities ?? [],
      api: "chat" as const,
    }))
    .filter((model) => model.outputModalities.includes("text") || model.outputModalities.includes("image"));

  const imageModels: ModelInfo[] = (imageBody.data ?? [])
    .filter((model): model is NonNullable<ImageModelsResponse["data"]>[number] & { id: string } => typeof model.id === "string")
    .filter((model) => !model.id.includes(":batch") && !model.id.startsWith("openrouter/"))
    .map((model) => ({
      id: model.id,
      name: model.name?.trim() || model.id,
      created: typeof model.created === "number" ? model.created : null,
      outputModalities: model.architecture?.output_modalities ?? ["image"],
      inputModalities: model.architecture?.input_modalities ?? ["text"],
      api: "images" as const,
      supportsAspectRatio: model.supported_parameters?.aspect_ratio !== undefined,
      supportsReferences: model.supported_parameters?.input_references !== undefined,
    }))
    .filter((model) => model.outputModalities.includes("image"));

  const merged = new Map<string, ModelInfo>();
  for (const model of chatModels) merged.set(model.id, model);
  for (const model of imageModels) {
    if (!merged.has(model.id)) merged.set(model.id, model);
  }
  const models = [...merged.values()];
  if (models.length === 0) throw new Error("OpenRouter returned no usable models.");
  return orderModels(models);
};

const withReferences = (text: string, referenceDataUrls: readonly string[], note: string): string | ContentPart[] => {
  if (referenceDataUrls.length === 0) return text;
  return [{ type: "text", text }, { type: "text", text: note }, ...referenceDataUrls.map((url) => ({ type: "image_url" as const, image_url: { url } }))];
};

export const composePrompt = async (options: {
  apiKey: string;
  model: string;
  brief: string;
  referenceDataUrls: readonly string[];
  signal: AbortSignal;
}): Promise<{ prompt: string }> => {
  const text = `Brief:\n${options.brief}\n\nWrite the prompt now.`;
  const content = withReferences(
    text,
    options.referenceDataUrls,
    "The reference images below are the visual direction. Use their subject, palette, composition, and texture. Translate what matters into words.",
  );

  const response = await request("/chat/completions", {
    method: "POST",
    headers: authHeaders(options.apiKey),
    signal: options.signal,
    body: JSON.stringify({
      model: options.model,
      temperature: 0.75,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content:
            "You are a prompt composer for an image generation model. Rewrite the user's brief into one precise, self-contained prompt. Preserve every named subject, constraint, and reference cue. Be specific about composition, lighting, material, palette, and camera or illustration style when the brief leaves them open, but never invent a different subject. Output only the prompt. No preamble, no quotes, no markdown.",
        },
        { role: "user", content },
      ] satisfies ChatMessage[],
    }),
  });

  const body = (await response.json()) as ChatResponse;
  const prompt = contentText(body.choices?.[0]?.message?.content).trim();
  if (!prompt) throw new Error("The prompt model returned an empty prompt.");
  return { prompt: prompt.replace(/^["'`]+|["'`]+$/g, "").trim() };
};

const extractImageUrl = (body: ChatResponse): string | null => {
  const message = body.choices?.[0]?.message;
  const image = message?.images?.[0];
  if (image) {
    const fromObject = typeof image.image_url === "object" ? image.image_url.url : image.image_url;
    if (typeof fromObject === "string" && fromObject.length > 0) return fromObject;
    if (typeof image.url === "string" && image.url.length > 0) return image.url;
  }
  const text = contentText(message?.content);
  return /https?:\/\/[^\s)"']+|data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/i.exec(text)?.[0] ?? null;
};

const mimeFromDataUrl = (url: string, fallback: string): string => {
  const match = /^data:([^;,]+)[;,]/.exec(url);
  return match?.[1] ?? fallback;
};

const dimsFromSvg = (svg: string): { width: number | null; height: number | null } => {
  const viewBox = /viewBox\s*=\s*["']\s*[-.\d]+\s+[-.\d]+\s+([-.\d]+)\s+([-.\d]+)/i.exec(svg);
  if (viewBox) return { width: Number(viewBox[1]) || null, height: Number(viewBox[2]) || null };
  const width = /\bwidth\s*=\s*["']([\d.]+)/i.exec(svg);
  const height = /\bheight\s*=\s*["']([\d.]+)/i.exec(svg);
  return { width: width ? Number(width[1]) || null : null, height: height ? Number(height[1]) || null : null };
};

const imageDimensions = async (blob: Blob, mime: string): Promise<{ width: number | null; height: number | null }> => {
  if (mime === "image/svg+xml") return dimsFromSvg(await blob.text());
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: null, height: null };
  }
};

const blobFromUrl = async (url: string, fallbackMime: string): Promise<{ blob: Blob; mime: string }> => {
  if (url.startsWith("data:")) {
    const mime = mimeFromDataUrl(url, fallbackMime);
    const payload = url.slice(url.indexOf(",") + 1);
    return { blob: blobFromBase64(payload, mime), mime };
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download the generated image (${response.status}).`);
  const mime = response.headers.get("content-type")?.split(";")[0]?.trim() || fallbackMime;
  return { blob: await response.blob(), mime };
};

const blobFromBase64 = (payload: string, mime: string): Blob => {
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
};

export const generateImage = async (options: {
  apiKey: string;
  model: string;
  api?: ModelApi;
  supportsAspectRatio?: boolean;
  supportsReferences?: boolean;
  prompt: string;
  referenceDataUrls: readonly string[];
  aspectRatio: string;
  signal: AbortSignal;
}): Promise<{ blob: Blob; mime: string; width: number | null; height: number | null }> => {
  if (options.api === "images") {
    const body: Record<string, unknown> = { model: options.model, prompt: options.prompt };
    if (options.supportsAspectRatio) body.aspect_ratio = options.aspectRatio;
    if (options.supportsReferences && options.referenceDataUrls.length > 0) {
      body.input_references = options.referenceDataUrls.map((url) => ({ type: "image_url", image_url: { url } }));
    }

    const response = await request("/images", {
      method: "POST",
      headers: authHeaders(options.apiKey),
      signal: options.signal,
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as ImagesResponse;
    const first = payload.data?.[0];
    if (!first) throw new Error("The model did not return an image.");

    let blob: Blob;
    let mime: string;
    if (typeof first.b64_json === "string" && first.b64_json.length > 0) {
      mime = first.media_type ?? "image/png";
      blob = blobFromBase64(first.b64_json, mime);
    } else if (typeof first.url === "string" && first.url.length > 0) {
      const downloaded = await blobFromUrl(first.url, first.media_type ?? "image/png");
      blob = downloaded.blob;
      mime = downloaded.mime;
    } else {
      throw new Error("The model did not return image bytes.");
    }
    const size = await imageDimensions(blob, mime);
    return { blob, mime, ...size };
  }

  const content = withReferences(
    options.prompt,
    options.referenceDataUrls,
    "Use the reference images as visual direction while keeping the written prompt authoritative.",
  );

  const response = await request("/chat/completions", {
    method: "POST",
    headers: authHeaders(options.apiKey),
    signal: options.signal,
    body: JSON.stringify({
      model: options.model,
      modalities: ["image", "text"],
      image_config: { aspect_ratio: options.aspectRatio },
      messages: [
        { role: "system", content: "Render the user's prompt faithfully. Honor every constraint and produce the image directly." },
        { role: "user", content },
      ] satisfies ChatMessage[],
    }),
  });

  const body = (await response.json()) as ChatResponse;
  const url = extractImageUrl(body);
  if (!url) throw new Error("The model did not return an image.");
  const { blob, mime } = await blobFromUrl(url, "image/png");
  const size = await imageDimensions(blob, mime);
  return { blob, mime, ...size };
};

export const generateSvg = async (options: {
  apiKey: string;
  model: string;
  prompt: string;
  referenceDataUrls: readonly string[];
  signal: AbortSignal;
}): Promise<{ blob: Blob; mime: string; width: number | null; height: number | null; text: string }> => {
  const content = withReferences(options.prompt, options.referenceDataUrls, "Use the reference images for subject, palette, and composition.");

  const response = await request("/chat/completions", {
    method: "POST",
    headers: authHeaders(options.apiKey),
    signal: options.signal,
    body: JSON.stringify({
      model: options.model,
      temperature: 0.7,
      max_tokens: 8000,
      messages: [
        {
          role: "system",
          content:
            "You are an SVG illustrator. Produce a single complete SVG document that satisfies the brief. Output only raw SVG: start with <svg and end with </svg>. Use a viewBox, no external images, no <script>, no <foreignObject>, no event attributes. Use flat vector shapes and a deliberate palette. The SVG must stand alone.",
        },
        { role: "user", content },
      ] satisfies ChatMessage[],
    }),
  });

  const body = (await response.json()) as ChatResponse;
  const raw = contentText(body.choices?.[0]?.message?.content);
  const match = /<svg[\s\S]*?<\/svg>/i.exec(raw);
  if (!match) throw new Error("The model did not return a raw SVG.");
  const svg = match[0];
  const size = dimsFromSvg(svg);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  return { blob, mime: "image/svg+xml", ...size, text: svg };
};

export { extractError as openRouterErrorMessage };
