import { composePrompt, generateImage, generateSvg, openRouterErrorMessage } from "./openrouter.ts";
import type { AssetRecord, CreationRecord, ModelState, RunRequest, TrialRecord } from "./types.ts";

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
  trials: creation.trials.map((trial) => ({ ...trial })),
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
  const sourceIds: Array<{ id: string | null; name: string }> =
    request.mode === "compose" ? request.promptLlmIds.map((modelId) => ({ id: modelId, name: modelName(models, modelId) })) : [{ id: null, name: "You" }];

  const trials: TrialRecord[] = [];
  for (const source of sourceIds) {
    for (const rendererId of request.rendererIds) {
      for (let variant = 0; variant < Math.max(1, request.variants); variant++) {
        trials.push({
          id: crypto.randomUUID(),
          creationId: id,
          llmId: source.id,
          llmName: source.id ? source.name : null,
          modelId: rendererId,
          modelName: modelName(models, rendererId),
          medium: request.medium,
          prompt: request.mode === "direct" ? request.brief.trim() : "",
          promptSource: source.name,
          status: "queued",
          error: null,
          assetId: null,
          seed: request.baseSeed + variant,
          costUsd: null,
          latencyMs: null,
          startedAt: createdAt,
          finishedAt: null,
        });
      }
    }
  }

  return {
    id,
    createdAt,
    brief: request.brief.trim(),
    mode: request.mode,
    medium: request.medium,
    promptLlmIds: [...request.promptLlmIds],
    rendererIds: [...request.rendererIds],
    aspectRatio: request.aspectRatio,
    variants: Math.max(1, request.variants),
    baseSeed: request.baseSeed,
    referenceAssetId: null,
    promptCostUsd: 0,
    trials,
    published: null,
  };
};

/**
 * Execute a prepared run. The engine owns the mutable creation and publishes
 * an immutable snapshot after every state change, so React and IndexedDB see
 * the same intermediate states as the network does. Composition fans out once
 * per prompt model; rendering fans out over the full renderer x variant grid.
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
  const finish = (trial: TrialRecord, patch: Partial<TrialRecord>) => {
    Object.assign(trial, patch);
    publish();
  };
  const now = () => new Date().toISOString();

  if (request.mode === "compose") {
    const groups = new Map<string, TrialRecord[]>();
    for (const trial of creation.trials) {
      if (!trial.llmId) continue;
      const group = groups.get(trial.llmId) ?? [];
      group.push(trial);
      groups.set(trial.llmId, group);
    }

    await mapLimit([...groups.entries()], 2, async ([llmId, trials]) => {
      if (signal.aborted) {
        for (const trial of trials) finish(trial, { status: "cancelled", error: null, finishedAt: now() });
        return;
      }
      for (const trial of trials) finish(trial, { status: "composing" });
      const started = performance.now();
      try {
        const result = await composePrompt({
          apiKey,
          model: llmId,
          brief: request.brief.trim(),
          referenceDataUrl: supportsImageInput(models, llmId) ? (request.reference?.dataUrl ?? null) : null,
          signal,
        });
        creation.promptCostUsd += result.costUsd ?? 0;
        for (const trial of trials) {
          finish(trial, {
            prompt: result.prompt,
            status: "queued",
            error: null,
            startedAt: now(),
            latencyMs: Math.round(performance.now() - started),
          });
        }
      } catch (error) {
        const cancelled = signal.aborted || isAbort(error);
        for (const trial of trials) {
          finish(trial, {
            status: cancelled ? "cancelled" : "error",
            error: cancelled ? null : openRouterErrorMessage(error),
            finishedAt: now(),
          });
        }
      }
    });
  }

  const renderable = creation.trials.filter((trial) => trial.status === "queued");
  await mapLimit(renderable, 2, async (trial) => {
    if (signal.aborted) {
      finish(trial, { status: "cancelled", error: null, finishedAt: now() });
      return;
    }

    finish(trial, { status: "rendering", startedAt: now() });
    const started = performance.now();
    const referenceDataUrl = supportsImageInput(models, trial.modelId) ? (request.reference?.dataUrl ?? null) : null;
    try {
      const result =
        trial.medium === "svg"
          ? await generateSvg({
              apiKey,
              model: trial.modelId,
              prompt: trial.prompt,
              referenceDataUrl,
              seed: trial.seed ?? creation.baseSeed,
              signal,
            })
          : await generateImage({
              apiKey,
              model: trial.modelId,
              prompt: trial.prompt,
              referenceDataUrl,
              aspectRatio: creation.aspectRatio,
              seed: trial.seed ?? creation.baseSeed,
              signal,
            });

      const asset: AssetRecord = {
        id: crypto.randomUUID(),
        creationId: creation.id,
        trialId: trial.id,
        kind: "output",
        mime: result.mime,
        blob: result.blob,
        width: result.width,
        height: result.height,
        text: "text" in result ? String((result as { text: string }).text) : null,
      };
      callbacks.onAsset(asset);
      finish(trial, {
        status: "done",
        assetId: asset.id,
        error: null,
        costUsd: result.costUsd,
        latencyMs: Math.round(performance.now() - started),
        finishedAt: now(),
      });
    } catch (error) {
      const cancelled = signal.aborted || isAbort(error);
      finish(trial, {
        status: cancelled ? "cancelled" : "error",
        error: cancelled ? null : openRouterErrorMessage(error),
        latencyMs: Math.round(performance.now() - started),
        finishedAt: now(),
      });
    }
  });

  for (const trial of creation.trials) {
    if (trial.status === "queued" || trial.status === "composing" || trial.status === "rendering") {
      finish(trial, { status: signal.aborted ? "cancelled" : "error", error: signal.aborted ? null : "The run stopped before this trial rendered.", finishedAt: now() });
    }
  }
  publish();
};
