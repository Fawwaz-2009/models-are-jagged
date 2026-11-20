import { composePrompt, generateImage, generateSvg, openRouterErrorMessage } from "./openrouter.ts";
import type { AssetRecord, CreationRecord, ModelState, OutputRecord, RunRequest } from "./types.ts";

export interface RunCallbacks {
  onCreation: (creation: CreationRecord) => void;
  onAsset: (asset: AssetRecord) => void;
}

const modelName = (models: ModelState, id: string): string => {
  const found = [...models.text, ...models.image].find((model) => model.id === id);
  return found?.name ?? prettyModelId(id);
};

export const prettyModelId = (id: string): string => {
  const tail = id.includes("/") ? id.slice(id.indexOf("/") + 1) : id;
  return tail
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bGpt\b/g, "GPT")
    .replace(/\bSvg\b/g, "SVG");
};

const supportsImageInput = (models: ModelState, id: string): boolean => {
  const found = [...models.text, ...models.image].find((model) => model.id === id);
  return found?.inputModalities.includes("image") ?? false;
};

const cloneCreation = (creation: CreationRecord): CreationRecord => ({
  ...creation,
  promptLlmIds: [...creation.promptLlmIds],
  rendererIds: [...creation.rendererIds],
  referenceAssetIds: [...creation.referenceAssetIds],
  outputs: creation.outputs.map((output) => ({ ...output })),
});

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";

const mapLimit = async <T>(items: readonly T[], limit: number, work: (item: T, index: number) => Promise<void>): Promise<void> => {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      const item = items[index];
      if (item === undefined) return;
      await work(item, index);
    }
  });
  await Promise.all(workers);
};

export const prepareRun = (request: RunRequest, models: ModelState): CreationRecord => {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const refined = request.promptLlmIds.length > 0;
  const sources: Array<{ id: string | null; name: string }> = refined
    ? request.promptLlmIds.map((modelId) => ({ id: modelId, name: modelName(models, modelId) }))
    : [{ id: null, name: "You" }];

  const outputs: OutputRecord[] = [];
  for (const source of sources) {
    for (const rendererId of request.rendererIds) {
      outputs.push({
        id: crypto.randomUUID(),
        creationId: id,
        llmId: source.id,
        llmName: source.id ? source.name : null,
        modelId: rendererId,
        modelName: modelName(models, rendererId),
        medium: request.medium,
        prompt: refined ? "" : request.brief.trim(),
        promptSource: source.name,
        status: "queued",
        error: null,
        assetId: null,
        startedAt: createdAt,
        finishedAt: null,
      });
    }
  }

  return {
    id,
    createdAt,
    brief: request.brief.trim(),
    mode: refined ? "compose" : "direct",
    medium: request.medium,
    promptLlmIds: [...request.promptLlmIds],
    rendererIds: [...request.rendererIds],
    aspectRatio: request.aspectRatio,
    referenceAssetIds: [],
    outputs,
    published: null,
  };
};

/**
 * Execute a prepared run. The engine owns the mutable creation and publishes
 * an immutable snapshot after every state change. Prompt models fan out first
 * when refine is on; then every prompt goes to every selected image or SVG
 * model. No hidden variants, no seed bookkeeping.
 */
export const executeRun = async (
  creation: CreationRecord,
  request: RunRequest,
  models: ModelState,
  apiKey: string,
  signal: AbortSignal,
  callbacks: RunCallbacks,
): Promise<void> => {
  const publish = () => callbacks.onCreation(cloneCreation(creation));
  const finish = (output: OutputRecord, patch: Partial<OutputRecord>) => {
    Object.assign(output, patch);
    publish();
  };
  const now = () => new Date().toISOString();
  const referenceDataUrls = request.references.map((reference) => reference.dataUrl);

  if (creation.mode === "compose") {
    const groups = new Map<string, OutputRecord[]>();
    for (const output of creation.outputs) {
      if (!output.llmId) continue;
      const group = groups.get(output.llmId) ?? [];
      group.push(output);
      groups.set(output.llmId, group);
    }

    await mapLimit([...groups.entries()], 2, async ([llmId, outputs]) => {
      if (signal.aborted) {
        for (const output of outputs) finish(output, { status: "cancelled", error: null, finishedAt: now() });
        return;
      }
      for (const output of outputs) finish(output, { status: "composing" });
      try {
        const result = await composePrompt({
          apiKey,
          model: llmId,
          brief: request.brief.trim(),
          referenceDataUrls: supportsImageInput(models, llmId) ? referenceDataUrls : [],
          signal,
        });
        for (const output of outputs) {
          finish(output, {
            prompt: result.prompt,
            status: "queued",
            error: null,
            startedAt: now(),
          });
        }
      } catch (error) {
        const cancelled = signal.aborted || isAbort(error);
        for (const output of outputs) {
          finish(output, {
            status: cancelled ? "cancelled" : "error",
            error: cancelled ? null : openRouterErrorMessage(error),
            finishedAt: now(),
          });
        }
      }
    });
  }

  const renderable = creation.outputs.filter((output) => output.status === "queued");
  await mapLimit(renderable, 2, async (output) => {
    if (signal.aborted) {
      finish(output, { status: "cancelled", error: null, finishedAt: now() });
      return;
    }

    finish(output, { status: "rendering", startedAt: now() });
    const modelReferences = supportsImageInput(models, output.modelId) ? referenceDataUrls : [];
    const renderer = [...models.text, ...models.image].find((model) => model.id === output.modelId);
    try {
      const result =
        output.medium === "svg"
          ? await generateSvg({
              apiKey,
              model: output.modelId,
              prompt: output.prompt,
              referenceDataUrls: modelReferences,
              signal,
            })
          : await generateImage({
              apiKey,
              model: output.modelId,
              api: renderer?.api ?? "chat",
              supportsAspectRatio: renderer?.supportsAspectRatio,
              supportsReferences: renderer?.supportsReferences,
              prompt: output.prompt,
              referenceDataUrls: modelReferences,
              aspectRatio: creation.aspectRatio,
              signal,
            });

      const asset: AssetRecord = {
        id: crypto.randomUUID(),
        creationId: creation.id,
        outputId: output.id,
        kind: "output",
        mime: result.mime,
        blob: result.blob,
        width: result.width,
        height: result.height,
        text: "text" in result ? String((result as { text: string }).text) : null,
      };
      callbacks.onAsset(asset);
      finish(output, {
        status: "done",
        assetId: asset.id,
        error: null,
        finishedAt: now(),
      });
    } catch (error) {
      const cancelled = signal.aborted || isAbort(error);
      finish(output, {
        status: cancelled ? "cancelled" : "error",
        error: cancelled ? null : openRouterErrorMessage(error),
        finishedAt: now(),
      });
    }
  });

  for (const output of creation.outputs) {
    if (output.status === "queued" || output.status === "composing" || output.status === "rendering") {
      finish(output, {
        status: signal.aborted ? "cancelled" : "error",
        error: signal.aborted ? null : "The run stopped before this output rendered.",
        finishedAt: now(),
      });
    }
  }
  publish();
};
