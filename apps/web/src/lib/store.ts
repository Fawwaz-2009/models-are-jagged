import { useSyncExternalStore } from "react";
import { authClient } from "../auth-client.ts";
import { blobToBase64 } from "./format.ts";
import * as db from "./db.ts";
import { fetchModels, openRouterErrorMessage } from "./openrouter.ts";
import { executeRun, prepareRun, prettyModelId } from "./run.ts";
import { DEFAULT_SETTINGS } from "./types.ts";
import type { AssetRecord, CreationRecord, Medium, ModelInfo, ModelState, OutputRecord, RunRequest, Settings, Toast } from "./types.ts";
import type { PublishArtifactInput, PublishInput } from "@app/backend/contract/publications";

const SETTINGS_KEY = "jagged:settings:v2";
const MODELS_KEY = "jagged:models:v3";
const MODEL_MAX_AGE = 12 * 60 * 60 * 1000;

const FALLBACK_TEXT: ModelInfo[] = [
  {
    id: "anthropic/claude-sonnet-5.5",
    name: "Claude Sonnet 5.5",
    created: null,
    outputModalities: ["text"],
    inputModalities: ["text", "image"],
  },
  {
    id: "openai/gpt-6.2-astra-pro",
    name: "GPT-6.2 Astra Pro",
    created: null,
    outputModalities: ["text"],
    inputModalities: ["text", "image"],
  },
  {
    id: "google/gemini-4-neon",
    name: "Gemini 4 Neon",
    created: null,
    outputModalities: ["text"],
    inputModalities: ["text", "image"],
  },
];

const FALLBACK_IMAGE: ModelInfo[] = [
  {
    id: "google/gemini-3-pro-image",
    name: "Gemini 3 Pro Image",
    created: null,
    outputModalities: ["image", "text"],
    inputModalities: ["text", "image"],
  },
  {
    id: "openai/gpt-5.4-image-2",
    name: "GPT-5.4 Image 2",
    created: null,
    outputModalities: ["image"],
    inputModalities: ["text", "image"],
  },
  {
    id: "google/gemini-3.1-flash-image",
    name: "Gemini 3.1 Flash Image",
    created: null,
    outputModalities: ["image", "text"],
    inputModalities: ["text", "image"],
  },
];

const orderModels = (models: readonly ModelInfo[]): ModelInfo[] =>
  [...models].sort((a, b) => {
    const created = (b.created ?? 0) - (a.created ?? 0);
    return created !== 0 ? created : a.name.localeCompare(b.name);
  });

const rendererPool = (models: ModelState, medium: Medium): readonly ModelInfo[] => (medium === "image" ? models.image : models.text);

const defaultRendererIds = (models: ModelState, medium: Medium): string[] =>
  [...rendererPool(models, medium)]
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .slice(0, 2)
    .map((model) => model.id);

export interface StudioState {
  ready: boolean;
  creations: CreationRecord[];
  assets: Record<string, AssetRecord>;
  assetUrls: Record<string, string>;
  models: ModelState;
  settings: Settings;
  running: Record<string, boolean>;
  detailId: string | null;
  focusOutputId: string | null;
  settingsOpen: boolean;
  publishId: string | null;
  compareOpen: boolean;
  selected: string[];
  toasts: Toast[];
}

const initialModels: ModelState = {
  text: [],
  image: [],
  loading: false,
  error: null,
  fetchedAt: null,
};

let state: StudioState = {
  ready: false,
  creations: [],
  assets: {},
  assetUrls: {},
  models: initialModels,
  settings: { ...DEFAULT_SETTINGS },
  running: {},
  detailId: null,
  focusOutputId: null,
  settingsOpen: false,
  publishId: null,
  compareOpen: false,
  selected: [],
  toasts: [],
};

const listeners = new Set<() => void>();
const runs = new Map<string, AbortController>();
let initPromise: Promise<void> | null = null;

const emit = () => {
  for (const listener of listeners) listener();
};

const update = (patch: Partial<StudioState>) => {
  state = { ...state, ...patch };
  emit();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => state;
const getServerSnapshot = () => state;

const toast = (message: string, tone: Toast["tone"] = "info") => {
  const id = crypto.randomUUID();
  update({ toasts: [...state.toasts, { id, message, tone, leaving: false }] });
  window.setTimeout(() => dismissToast(id), 5200);
};

const dismissToast = (id: string) => {
  const entry = state.toasts.find((toast) => toast.id === id);
  if (!entry || entry.leaving) return;
  update({ toasts: state.toasts.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)) });
  window.setTimeout(() => {
    update({ toasts: state.toasts.filter((toast) => toast.id !== id) });
  }, 190);
};

const readSettings = (): Settings => {
  try {
    const stored = window.localStorage.getItem(SETTINGS_KEY);
    const legacy = stored ? null : window.localStorage.getItem("jagged:settings:v1");
    const raw = stored ?? legacy;
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings> & { mode?: string };
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      medium: parsed.medium === "svg" ? "svg" : "image",
      promptModelIds:
        legacy && parsed.mode !== "compose" ? [] : Array.isArray(parsed.promptModelIds) ? parsed.promptModelIds.filter((id): id is string => typeof id === "string") : [],
      rendererIds: Array.isArray(parsed.rendererIds) ? parsed.rendererIds.filter((id): id is string => typeof id === "string") : [],
      aspectRatio: typeof parsed.aspectRatio === "string" ? parsed.aspectRatio : DEFAULT_SETTINGS.aspectRatio,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

const persistSettings = (settings: Settings) => {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // A full quota should not take the studio down; the key still lives in memory.
  }
};

const splitModels = (models: readonly ModelInfo[]): Pick<ModelState, "text" | "image"> => {
  const ordered = orderModels(models);
  return {
    text: ordered.filter((model) => model.outputModalities.includes("text") && !model.outputModalities.includes("image")),
    image: ordered.filter((model) => model.outputModalities.includes("image")),
  };
};

const normalizeSettings = (settings: Settings, models: ModelState): Settings => {
  const textIds = new Set(models.text.map((model) => model.id));
  const pool = rendererPool(models, settings.medium);
  return {
    ...settings,
    promptModelIds: settings.promptModelIds.filter((id) => textIds.has(id)),
    rendererIds: settings.rendererIds.filter((id) => pool.some((model) => model.id === id)),
  };
};

const withDefaults = (settings: Settings, models: ModelState): Settings => {
  const normalized = normalizeSettings(settings, models);
  return {
    ...normalized,
    rendererIds: normalized.rendererIds.length > 0 ? normalized.rendererIds : defaultRendererIds(models, normalized.medium),
  };
};

const isModelInfo = (value: unknown): value is ModelInfo => {
  if (!value || typeof value !== "object") return false;
  const model = value as Record<string, unknown>;
  return typeof model.id === "string" && typeof model.name === "string" && Array.isArray(model.outputModalities) && Array.isArray(model.inputModalities);
};

const readModelCache = (): { models: ModelState; fresh: boolean } | null => {
  try {
    const raw = window.localStorage.getItem(MODELS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fetchedAt?: number; models?: unknown };
    if (!Array.isArray(parsed.models) || typeof parsed.fetchedAt !== "number") return null;
    const models = parsed.models.filter(isModelInfo).map((model) => ({ ...model, created: model.created ?? null }));
    if (models.length === 0) return null;
    const split = splitModels(models);
    return {
      models: { ...split, loading: false, error: null, fetchedAt: parsed.fetchedAt },
      fresh: Date.now() - parsed.fetchedAt < MODEL_MAX_AGE,
    };
  } catch {
    return null;
  }
};

const persistModels = (models: ModelState) => {
  try {
    window.localStorage.setItem(MODELS_KEY, JSON.stringify({ fetchedAt: Date.now(), models: [...models.text, ...models.image] }));
  } catch {
    // Cache only.
  }
};

const refreshModels = async () => {
  if (state.models.loading) return;
  update({ models: { ...state.models, loading: true, error: null } });
  try {
    const fetched = await fetchModels(AbortSignal.timeout(15_000));
    const split = splitModels(fetched);
    const models: ModelState = { ...split, loading: false, error: null, fetchedAt: Date.now() };
    const settings = withDefaults(state.settings, models);
    persistModels(models);
    persistSettings(settings);
    update({ models, settings });
  } catch (error) {
    const hasModels = state.models.text.length > 0 || state.models.image.length > 0;
    const split = hasModels ? { text: state.models.text, image: state.models.image } : { text: FALLBACK_TEXT, image: FALLBACK_IMAGE };
    const models: ModelState = { ...split, loading: false, error: openRouterErrorMessage(error), fetchedAt: state.models.fetchedAt };
    const settings = withDefaults(state.settings, models);
    persistSettings(settings);
    update({ models, settings });
  }
};

const asString = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

const migrateOutput = (raw: unknown, creationId: string, medium: Medium): OutputRecord | null => {
  if (!raw || typeof raw !== "object") return null;
  const output = raw as Record<string, unknown>;
  const modelId = asString(output.modelId);
  if (!modelId) return null;
  const status =
    output.status === "composing" || output.status === "rendering" || output.status === "queued" || output.status === "error" || output.status === "cancelled"
      ? output.status
      : "done";
  return {
    id: asString(output.id) ?? crypto.randomUUID(),
    creationId,
    llmId: asString(output.llmId),
    llmName: asString(output.llmName),
    modelId,
    modelName: asString(output.modelName) ?? prettyModelId(modelId),
    medium,
    prompt: typeof output.prompt === "string" ? output.prompt : "",
    promptSource: asString(output.promptSource) ?? "You",
    status,
    error: asString(output.error),
    assetId: asString(output.assetId),
    startedAt: asString(output.startedAt) ?? new Date().toISOString(),
    finishedAt: asString(output.finishedAt),
  };
};

const migrateCreation = (raw: unknown): CreationRecord | null => {
  if (!raw || typeof raw !== "object") return null;
  const creation = raw as Record<string, unknown> & { trials?: unknown[]; referenceAssetId?: unknown };
  const id = asString(creation.id);
  if (!id) return null;
  const medium: Medium = creation.medium === "svg" ? "svg" : "image";
  const promptLlmIds = Array.isArray(creation.promptLlmIds) ? creation.promptLlmIds.filter((entry): entry is string => typeof entry === "string") : [];
  const rendererIds = Array.isArray(creation.rendererIds) ? creation.rendererIds.filter((entry): entry is string => typeof entry === "string") : [];
  const rawOutputs = Array.isArray(creation.outputs) ? creation.outputs : Array.isArray(creation.trials) ? creation.trials : [];
  const referenceAssetIds = Array.isArray(creation.referenceAssetIds)
    ? creation.referenceAssetIds.filter((entry): entry is string => typeof entry === "string")
    : asString(creation.referenceAssetId)
      ? [creation.referenceAssetId as string]
      : [];
  const publishedRaw = creation.published && typeof creation.published === "object" ? (creation.published as Record<string, unknown>) : null;
  const published =
    publishedRaw && asString(publishedRaw.id) && asString(publishedRaw.url)
      ? {
          id: publishedRaw.id as string,
          handle: asString(publishedRaw.handle) ?? "",
          url: publishedRaw.url as string,
          at: asString(publishedRaw.at) ?? new Date().toISOString(),
        }
      : null;
  const mode = creation.mode === "compose" || creation.mode === "direct" ? creation.mode : promptLlmIds.length > 0 ? "compose" : "direct";
  return {
    id,
    createdAt: asString(creation.createdAt) ?? new Date().toISOString(),
    brief: typeof creation.brief === "string" ? creation.brief : "",
    mode,
    medium,
    promptLlmIds,
    rendererIds,
    aspectRatio: asString(creation.aspectRatio) ?? "1:1",
    referenceAssetIds,
    outputs: rawOutputs.map((entry) => migrateOutput(entry, id, medium)).filter((entry): entry is OutputRecord => entry !== null),
    published,
  };
};

const init = () => {
  initPromise ??= (async () => {
    const settings = readSettings();
    let creations: CreationRecord[] = [];
    let assets: AssetRecord[] = [];
    try {
      const loaded = await db.loadAll();
      creations = loaded.creations
        .map(migrateCreation)
        .filter((entry): entry is CreationRecord => entry !== null)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      assets = loaded.assets.map((asset) => ({
        ...asset,
        outputId: asset.outputId ?? (asset as AssetRecord & { trialId?: string | null }).trialId ?? null,
      }));
    } catch {
      toast("This browser could not open local storage. Runs will not persist.", "error");
    }
    const assetMap: Record<string, AssetRecord> = {};
    const assetUrls: Record<string, string> = {};
    for (const asset of assets) {
      assetMap[asset.id] = asset;
      assetUrls[asset.id] = URL.createObjectURL(asset.blob);
    }
    const cache = readModelCache();
    const models = cache?.models ?? {
      text: FALLBACK_TEXT,
      image: FALLBACK_IMAGE,
      loading: false,
      error: null,
      fetchedAt: null,
    };
    update({
      ready: true,
      creations,
      assets: assetMap,
      assetUrls,
      models,
      settings: withDefaults(settings, models),
    });
    if (!cache?.fresh) void refreshModels();
  })();
  return initPromise;
};

const updateSettings = (patch: Partial<Settings>) => {
  const next = normalizeSettings({ ...state.settings, ...patch }, state.models);
  persistSettings(next);
  update({ settings: next });
};

const setMedium = (medium: Medium) => {
  const settings = withDefaults({ ...state.settings, medium, rendererIds: [] }, state.models);
  persistSettings(settings);
  update({ settings });
};

const setRefine = (enabled: boolean) => {
  if (!enabled) {
    updateSettings({ promptModelIds: [] });
    return;
  }
  const first = state.models.text[0];
  if (!first) {
    toast("No prompt models are available yet.", "info");
    return;
  }
  updateSettings({ promptModelIds: state.settings.promptModelIds.length > 0 ? state.settings.promptModelIds : [first.id] });
};

const togglePromptModel = (id: string) => {
  const selected = state.settings.promptModelIds;
  const next = selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id];
  updateSettings({ promptModelIds: next });
};

const toggleRenderer = (id: string) => {
  const selected = state.settings.rendererIds;
  const next = selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id];
  updateSettings({ rendererIds: next });
};

const updateCreation = (next: CreationRecord, persist = true) => {
  update({ creations: state.creations.map((creation) => (creation.id === next.id ? next : creation)) });
  if (persist) void db.saveCreation(next).catch(() => toast("Could not save this run locally.", "error"));
};

const startRun = async (request: RunRequest): Promise<string | null> => {
  const settings = state.settings;
  if (!settings.apiKey.trim()) {
    update({ settingsOpen: true });
    toast("Add your OpenRouter key to generate.", "error");
    return null;
  }
  if (request.brief.trim().length < 3) {
    toast("Write a brief first.", "error");
    return null;
  }
  if (request.rendererIds.length === 0) {
    toast(request.medium === "image" ? "Choose at least one image model." : "Choose at least one SVG model.", "error");
    return null;
  }

  const creation = prepareRun(request, state.models);
  const assets = { ...state.assets };
  const assetUrls = { ...state.assetUrls };
  const references: AssetRecord[] = request.references.map((reference) => {
    const asset: AssetRecord = {
      id: crypto.randomUUID(),
      creationId: creation.id,
      outputId: null,
      kind: "reference",
      mime: reference.mime,
      blob: reference.blob,
      width: null,
      height: null,
      text: null,
    };
    assets[asset.id] = asset;
    assetUrls[asset.id] = reference.dataUrl || URL.createObjectURL(reference.blob);
    void db.saveAsset(asset).catch(() => toast("Could not save a reference image locally.", "error"));
    return asset;
  });
  creation.referenceAssetIds = references.map((reference) => reference.id);

  update({
    creations: [creation, ...state.creations],
    assets,
    assetUrls,
    running: { ...state.running, [creation.id]: true },
    detailId: null,
    focusOutputId: null,
  });
  void db.saveCreation(creation).catch(() => toast("Could not save this run locally.", "error"));

  const controller = new AbortController();
  runs.set(creation.id, controller);

  void executeRun(creation, request, state.models, settings.apiKey.trim(), controller.signal, {
    onCreation: (next) => updateCreation(next),
    onAsset: (asset) => {
      const url = URL.createObjectURL(asset.blob);
      update({ assets: { ...state.assets, [asset.id]: asset }, assetUrls: { ...state.assetUrls, [asset.id]: url } });
      void db.saveAsset(asset).catch(() => toast("Could not save an output locally.", "error"));
    },
  })
    .catch((error) => toast(openRouterErrorMessage(error), "error"))
    .finally(() => {
      runs.delete(creation.id);
      update({ running: { ...state.running, [creation.id]: false } });
    });

  return creation.id;
};

const cancelRun = (id: string) => {
  runs.get(id)?.abort();
  toast("Stopping the run.", "info");
};

const deleteCreation = (id: string) => {
  runs.get(id)?.abort();
  const creation = state.creations.find((entry) => entry.id === id);
  const outputIds = new Set(creation?.outputs.map((output) => output.id) ?? []);
  const assetIds = Object.values(state.assets)
    .filter((asset) => asset.creationId === id)
    .map((asset) => asset.id);
  const urls = { ...state.assetUrls };
  for (const assetId of assetIds) {
    if (urls[assetId]) URL.revokeObjectURL(urls[assetId]);
    delete urls[assetId];
  }
  const assets = { ...state.assets };
  for (const assetId of assetIds) delete assets[assetId];
  const running = { ...state.running };
  delete running[id];
  update({
    creations: state.creations.filter((creation) => creation.id !== id),
    assets,
    assetUrls: urls,
    running,
    detailId: state.detailId === id ? null : state.detailId,
    focusOutputId: state.detailId === id ? null : state.focusOutputId,
    selected: state.selected.filter((outputId) => !outputIds.has(outputId)),
  });
  void db.deleteCreationRow(id).catch(() => toast("Could not remove the local run.", "error"));
  void db.deleteAssetRows(assetIds).catch(() => toast("Could not remove the local files.", "error"));
};

const clearGallery = () => {
  for (const controller of runs.values()) controller.abort();
  runs.clear();
  for (const url of Object.values(state.assetUrls)) URL.revokeObjectURL(url);
  update({ creations: [], assets: {}, assetUrls: {}, running: {}, selected: [], detailId: null, focusOutputId: null });
  void db.clearAllRows().catch(() => toast("Could not clear local storage.", "error"));
};

const clearSelected = () => update({ selected: [] });

const toggleSelected = (outputId: string) => {
  if (state.selected.includes(outputId)) {
    update({ selected: state.selected.filter((id) => id !== outputId) });
    return;
  }
  if (state.selected.length >= 4) {
    toast("Compare up to four outputs at once.", "info");
    return;
  }
  update({ selected: [...state.selected, outputId] });
};

const publishCreation = async (id: string, options: { title: string; tags: string[]; publicOrigin: string; outputIds: string[] }): Promise<{ url: string }> => {
  const creation = state.creations.find((entry) => entry.id === id);
  if (!creation) throw new Error("This run is not in the local gallery.");
  const session = await authClient.getSession();
  if (!session.data?.user) throw new Error("Sign in to publish. Your runs stay local until you do.");

  const completed = creation.outputs.filter((output) => output.status === "done" && output.assetId && options.outputIds.includes(output.id));
  if (completed.length === 0) throw new Error("Select at least one finished output.");
  if (completed.length > 16) throw new Error("Publish at most 16 outputs at a time.");

  const artifacts: PublishArtifactInput[] = [];
  for (const output of completed) {
    const asset = state.assets[output.assetId ?? ""];
    if (!asset) continue;
    artifacts.push({
      clientId: output.id,
      prompt: output.prompt,
      promptSource: output.promptSource,
      llmId: output.llmId,
      modelId: output.modelId,
      mediaType: output.medium,
      mime: asset.mime as PublishArtifactInput["mime"],
      data: await blobToBase64(asset.blob),
      width: asset.width,
      height: asset.height,
      seed: null,
      costUsd: null,
      latencyMs: null,
    });
  }
  if (artifacts.length === 0) throw new Error("The selected outputs have no local files.");

  const payload: PublishInput = {
    clientId: creation.id,
    title: options.title.trim() || creation.brief.slice(0, 80),
    brief: creation.brief,
    mode: creation.mode,
    medium: creation.medium,
    tags: options.tags,
    createdAt: creation.createdAt,
    artifacts,
  };

  const response = await fetch("/api/publish", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as { id?: string; handle?: string; path?: string; error?: string };
  if (!response.ok || !body.id || !body.path) throw new Error(body.error ?? "Could not publish this run.");
  const origin = options.publicOrigin || window.location.origin;
  const published = { id: body.id, handle: body.handle ?? "", url: `${origin}${body.path}`, at: new Date().toISOString() };
  updateCreation({ ...creation, published });
  return { url: published.url };
};

const unpublishCreation = async (id: string) => {
  const creation = state.creations.find((entry) => entry.id === id);
  if (!creation?.published) return;
  const response = await fetch(`/api/publications/${encodeURIComponent(creation.published.id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok && response.status !== 404) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Could not unpublish this run.");
  }
  updateCreation({ ...creation, published: null });
};

const openDetail = (id: string) => {
  const creation = state.creations.find((entry) => entry.id === id);
  const firstDone = creation?.outputs.find((output) => output.status === "done") ?? creation?.outputs[0];
  update({ detailId: id, focusOutputId: firstDone?.id ?? null });
};

const openOutput = (creationId: string, outputId: string) => update({ detailId: creationId, focusOutputId: outputId });
const setFocusOutput = (outputId: string) => update({ focusOutputId: outputId });
const closeDetail = () => update({ detailId: null, focusOutputId: null });
const openSettings = () => update({ settingsOpen: true });
const closeSettings = () => update({ settingsOpen: false });
const openPublish = (id: string) => {
  const creation = state.creations.find((entry) => entry.id === id);
  if (!creation) return;
  if (!creation.outputs.some((output) => output.status === "done")) {
    toast("Finish at least one output before publishing.", "info");
    return;
  }
  update({ publishId: id, detailId: null, focusOutputId: null });
};
const closePublish = () => update({ publishId: null });
const openCompare = () => {
  if (state.selected.length < 2) {
    toast("Select at least two outputs to compare.", "info");
    return;
  }
  update({ compareOpen: true });
};
const closeCompare = () => update({ compareOpen: false });

export const studio = {
  init,
  refreshModels,
  updateSettings,
  setMedium,
  setRefine,
  togglePromptModel,
  toggleRenderer,
  startRun,
  cancelRun,
  deleteCreation,
  clearGallery,
  toggleSelected,
  clearSelected,
  publishCreation,
  unpublishCreation,
  openDetail,
  openOutput,
  setFocusOutput,
  closeDetail,
  openSettings,
  closeSettings,
  openPublish,
  closePublish,
  openCompare,
  closeCompare,
  dismissToast,
  toast,
};

export const useStudio = (): StudioState => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

export const findCreation = (state: StudioState, id: string | null): CreationRecord | undefined =>
  id ? state.creations.find((creation) => creation.id === id) : undefined;

export const findOutput = (state: StudioState, outputId: string): { creation: CreationRecord; output: OutputRecord } | null => {
  for (const creation of state.creations) {
    const output = creation.outputs.find((entry) => entry.id === outputId);
    if (output) return { creation, output };
  }
  return null;
};
