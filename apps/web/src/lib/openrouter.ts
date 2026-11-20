import type { ModelInfo } from "./types.ts";

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
  usage?: { cost?: number; total_cost?: number };
}

interface ModelsResponse {
  data?: Array<{
    id?: string;
    name?: string;
    description?: string;
    context_length?: number;
    architecture?: { input_modalities?: string[]; output_modalities?: string[] };
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

export const fetchModels = async (signal?: AbortSignal): Promise<ModelInfo[]> => {
  const response = await request("/models", {
    method: "GET",
    signal,
  });
  const body = (await response.json()) as ModelsResponse;
  const models = (body.data ?? [])
    .filter((model): model is NonNullable<ModelsResponse["data"]>[number] & { id: string } => typeof model.id === "string")
    .filter((model) => !model.id.includes(":batch") && !model.id.startsWith("openrouter/"))
    .map((model) => ({
      id: model.id,
      name: model.name?.trim() || model.id,
      description: model.description?.trim() || "",
      contextLength: typeof model.context_length === "number" ? model.context_length : null,
      outputModalities: model.architecture?.output_modalities ?? [],
      inputModalities: model.architecture?.input_modalities ?? [],
    }))
    .filter((model) => model.outputModalities.includes("text") || model.outputModalities.includes("image"));

  if (models.length === 0) throw new Error("OpenRouter returned no usable models.");
  return models.sort((a, b) => a.name.localeCompare(b.name));
};

export const composePrompt = async (options: {
  apiKey: string;
  model: string;
  brief: string;
  referenceDataUrl: string | null;
  signal: AbortSignal;
}): Promise<{ prompt: string; costUsd: number | null }> => {
  const userText = `Brief:\n${options.brief}\n\nWrite the prompt now.`;
  const content: string | ContentPart[] = options.referenceDataUrl
    ? [
        { type: "text", text: userText },
        { type: "text", text: "The reference image below is the visual direction. Translate its subject, palette, and composition into words." },
        { type: "image_url", image_url: { url: options.referenceDataUrl } },
      ]
    : userText;

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
  const cost = body.usage?.cost ?? body.usage?.total_cost ?? null;
  return { prompt: prompt.replace(/^["'`]+|["'`]+$/g, "").trim(), costUsd: typeof cost === "number" ? cost : null };
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
  const dataUrl = /https?:\/\/[^\s)"']+|data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/i.exec(text)?.[0];
  return dataUrl ?? null;
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
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return { blob: new Blob([bytes], { type: mime }), mime };
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download the generated image (${response.status}).`);
  const mime = response.headers.get("content-type")?.split(";")[0]?.trim() || fallbackMime;
  return { blob: await response.blob(), mime };
};

export const generateImage = async (options: {
  apiKey: string;
  model: string;
  prompt: string;
  referenceDataUrl: string | null;
  aspectRatio: string;
  seed: number;
  signal: AbortSignal;
}): Promise<{ blob: Blob; mime: string; width: number | null; height: number | null; costUsd: number | null }> => {
  const content: string | ContentPart[] = options.referenceDataUrl
    ? [
        { type: "text", text: options.prompt },
        { type: "image_url", image_url: { url: options.referenceDataUrl } },
      ]
    : options.prompt;

  const response = await request("/chat/completions", {
    method: "POST",
    headers: authHeaders(options.apiKey),
    signal: options.signal,
    body: JSON.stringify({
      model: options.model,
      modalities: ["image", "text"],
      image_config: { aspect_ratio: options.aspectRatio },
      seed: options.seed,
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
  const cost = body.usage?.cost ?? body.usage?.total_cost ?? null;
  return { blob, mime, ...size, costUsd: typeof cost === "number" ? cost : null };
};

export const generateSvg = async (options: {
  apiKey: string;
  model: string;
  prompt: string;
  referenceDataUrl: string | null;
  seed: number;
  signal: AbortSignal;
}): Promise<{ blob: Blob; mime: string; width: number | null; height: number | null; text: string; costUsd: number | null }> => {
  const content: string | ContentPart[] = options.referenceDataUrl
    ? [
        { type: "text", text: options.prompt },
        { type: "image_url", image_url: { url: options.referenceDataUrl } },
      ]
    : options.prompt;

  const response = await request("/chat/completions", {
    method: "POST",
    headers: authHeaders(options.apiKey),
    signal: options.signal,
    body: JSON.stringify({
      model: options.model,
      temperature: 0.7,
      max_tokens: 8000,
      seed: options.seed,
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
  const cost = body.usage?.cost ?? body.usage?.total_cost ?? null;
  return { blob, mime: "image/svg+xml", ...size, text: svg, costUsd: typeof cost === "number" ? cost : null };
};

export { extractError as openRouterErrorMessage };
