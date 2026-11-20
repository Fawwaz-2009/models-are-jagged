import { useSyncExternalStore } from "react";
import { authClient } from "../auth-client.ts";
import { blobToBase64 } from "./format.ts";
import * as db from "./db.ts";
import { fetchModels, openRouterErrorMessage } from "./openrouter.ts";
import { executeRun, prepareRun } from "./run.ts";
import { DEFAULT_SETTINGS } from "./types.ts";
import type { AssetRecord, CreationRecord, Medium, ModelInfo, ModelState, RunRequest, Settings, Toast } from "./types.ts";
import type { PublishArtifactInput, PublishInput } from "@app/backend/contract/publications";

const SETTINGS_KEY = "jagged:settings:v1";
const MODELS_KEY = "jagged:models:v1";
const MODEL_MAX_AGE = 12 * 60 * 60 * 1000;

const FALLBACK_TEXT: ModelInfo[] = [
  {
    id: "anthropic/claude-sonnet-5.5",
    name: "Claude Sonnet 5.5",
    description: "A strong prompt composer with image input.",
    contextLength: null,
    outputModalities: ["text"],
    inputModalities: ["text", "image"],
  },
  {
    id: "openai/gpt-6.2-astra-pro",
    name: "GPT-6.2 Astra Pro",
    description: "A careful generalist for prompt composition.",
    contextLength: null,
    outputModalities: ["text"],
    inputModalities: ["text", "image"],
  },
  {
    id: "google/gemini-4-neon",
    name: "Gemini 4 Neon",
    description: "A multimodal prompt composer.",
    contextLength: null,
    outputModalities: ["text"],
    inputModalities: ["text", "image"],
  },
];

const FALLBACK_IMAGE: ModelInfo[] = [
  {
    id: "google/gemini-3-pro-image",
    name: "Gemini 3 Pro Image",
    description: "Image generation with strong prompt adherence.",
    contextLength: null,
    outputModalities: ["image", "text"],
    inputModalities: ["text", "image"],
  },
  {
    id: "openai/gpt-5.4-image-2",
    name: "GPT-5.4 Image 2",
    description: "Image generation from OpenAI.",
    contextLength: null,
    outputModalities: ["image"],
    inputModalities: ["text", "image"],
  },
  {
    id: "google/gemini-3.1-flash-image",
    name: "Gemini 3.1 Flash Image",
    description: "A fast image model with prompt adherence.",
    contextLength: null,
    outputModalities: ["image", "text"],
    inputModalities: ["text", "image"],
  },
];

const PREFERRED_PROMPT_MODELS = ["anthropic/claude-sonnet-5.5", "openai/gpt-6.2-astra-pro", "google/gemini-4-neon", "anthropic/claude-opus-5.5"];
const PREFERRED_IMAGE_MODELS = ["google/gemini-3-pro-image", "openai/gpt-5.4-image-2", "google/gemini-3.1-flash-image", "openai/gpt-5-image"];

const preferredDefaults = (models: readonly ModelInfo[], preferred: readonly string[], count: number): string[] => {
  const picked: ModelInfo[] = [];
  for (const id of preferred) {
    const model = models.find((entry) => entry.id === id);
    if (model && !picked.includes(model)) picked.push(model);
    if (picked.length === count) break;
  }
  for (const model of models) {
    if (picked.length === count) break;
    if (!picked.includes(model)) picked.push(model);
  }
  return picked.map((model) => model.id);
};

export interface StudioState {
  ready: boolean;
  creations: CreationRecord[];
  assets: Record<string, AssetRecord>;
  assetUrls: Record<string, string>;
  models: ModelState;
  settings: Settings;
  running: Record<string, boolean>;
  detailId: string | null;
  settingsOpen: boolean;
  publishId: string | null;
  compareOpen: boolean;
  selected: string[];
  filterModel: string | null;
  filterMedium: "all" | Medium;
  query: string;
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
  settings: DEFAULT_SETTINGS,
  running: {},
  detailId: null,
  settingsOpen: false,
  publishId: null,
  compareOpen: false,
  selected: [],
  filterModel: null,
  filterMedium: "all",
  query: "",
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
  update({ toasts: [...state.toasts, { id, message, tone }] });
  window.setTimeout(() => dismissToast(id), 5200);
};

const dismissToast = (id: string) => {
  update({ toasts: state.toasts.filter((entry) => entry.id !== id) });
};

const readSettings = (): Settings => {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      promptModelIds: Array.isArray(parsed.promptModelIds) ? parsed.promptModelIds.filter((id): id is string => typeof id === "string") : [],
      rendererIds: Array.isArray(parsed.rendererIds) ? parsed.rendererIds.filter((id): id is string => typeof id === "string") : [],
      variants: typeof parsed.variants === "number" ? Math.max(1, Math.min(3, parsed.variants)) : 1,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const persistSettings = (settings: Settings) => {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // A full quota should not take the studio down; the key still lives in memory.
  }
};

const splitModels = (models: readonly ModelInfo[]): Pick<ModelState, "text" | "image"> => ({
  text: models.filter((model) => model.outputModalities.includes("text") && !model.outputModalities.includes("image")),
  image: models.filter((model) => model.outputModalities.includes("image")),
});

const normalizeSettings = (settings: Settings, models: ModelState): Settings => {
  const textIds = new Set(models.text.map((model) => model.id));
  const rendererPool = settings.medium === "image" ? models.image : models.text;
  const rendererIds = settings.rendererIds.filter((id) => rendererPool.some((model) => model.id === id));
  const promptModelIds = settings.promptModelIds.filter((id) => textIds.has(id));
  return {
    ...settings,
    promptModelIds: promptModelIds.length > 0 ? promptModelIds : preferredDefaults(models.text, PREFERRED_PROMPT_MODELS, 2),
    rendererIds:
      rendererIds.length > 0 ? rendererIds : preferredDefaults(rendererPool, settings.medium === "image" ? PREFERRED_IMAGE_MODELS : PREFERRED_PROMPT_MODELS, 1),
  };
};

const readModelCache = (): { models: ModelState; fresh: boolean } | null => {
  try {
    const raw = window.localStorage.getItem(MODELS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fetchedAt?: number; models?: ModelInfo[] };
    if (!Array.isArray(parsed.models) || typeof parsed.fetchedAt !== "number") return null;
    const split = splitModels(parsed.models);
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
    const settings = normalizeSettings(state.settings, models);
    persistModels(models);
    persistSettings(settings);
    update({ models, settings });
  } catch (error) {
    const hasModels = state.models.text.length > 0 || state.models.image.length > 0;
    const split = hasModels ? { text: state.models.text, image: state.models.image } : { text: FALLBACK_TEXT, image: FALLBACK_IMAGE };
    const models: ModelState = { ...split, loading: false, error: openRouterErrorMessage(error), fetchedAt: state.models.fetchedAt };
    const settings = normalizeSettings(state.settings, models);
    persistSettings(settings);
    update({ models, settings });
  }
};

const init = () => {
  initPromise ??= (async () => {
    const settings = readSettings();
    let creations: CreationRecord[] = [];
    let assets: AssetRecord[] = [];
    try {
      const loaded = await db.loadAll();
      creations = loaded.creations.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      assets = loaded.assets;
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
    const normalized = normalizeSettings(settings, models);
    update({
      ready: true,
      creations,
      assets: assetMap,
      assetUrls,
      models,
      settings: normalized,
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
  const settings = normalizeSettings({ ...state.settings, medium, rendererIds: [] }, state.models);
  persistSettings(settings);
  update({ settings });
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
    toast("Add your OpenRouter key to run a comparison.", "error");
    return null;
  }
  if (request.brief.trim().length < 3) {
    toast("Write a brief first.", "error");
    return null;
  }
  if (request.rendererIds.length === 0) {
    toast("Choose at least one renderer.", "error");
    return null;
  }
  if (request.mode === "compose" && request.promptLlmIds.length === 0) {
    toast("Choose at least one prompt model.", "error");
    return null;
  }

  const creation = prepareRun(request, state.models);
  const reference: AssetRecord | null = request.reference
    ? {
        id: crypto.randomUUID(),
        creationId: creation.id,
        trialId: null,
        kind: "reference",
        mime: request.reference.mime,
        blob: request.reference.blob,
        width: null,
        height: null,
        text: null,
      }
    : null;
  if (reference) creation.referenceAssetId = reference.id;

  const assetUrls = { ...state.assetUrls };
  const assets = { ...state.assets };
  if (reference) {
    assets[reference.id] = reference;
    assetUrls[reference.id] = URL.createObjectURL(reference.blob);
    void db.saveAsset(reference).catch(() => toast("Could not save the reference image locally.", "error"));
  }

  update({
    creations: [creation, ...state.creations],
    assets,
    assetUrls,
    running: { ...state.running, [creation.id]: true },
    detailId: null,
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
  toast("Stopping the run…", "info");
};

const deleteCreation = (id: string) => {
  runs.get(id)?.abort();
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
    selected: state.selected.filter((trialId) => !state.creations.find((creation) => creation.id === id)?.trials.some((trial) => trial.id === trialId)),
  });
  void db.deleteCreationRow(id).catch(() => toast("Could not remove the local run.", "error"));
  void db.deleteAssetRows(assetIds).catch(() => toast("Could not remove the local files.", "error"));
};

const clearGallery = () => {
  for (const controller of runs.values()) controller.abort();
  runs.clear();
  for (const url of Object.values(state.assetUrls)) URL.revokeObjectURL(url);
  update({ creations: [], assets: {}, assetUrls: {}, running: {}, selected: [], detailId: null });
  void db.clearAllRows().catch(() => toast("Could not clear local storage.", "error"));
};

const clearSelected = () => update({ selected: [] });

const toggleSelected = (trialId: string) => {
  if (state.selected.includes(trialId)) {
    update({ selected: state.selected.filter((id) => id !== trialId) });
    return;
  }
  if (state.selected.length >= 4) {
    toast("Compare up to four outputs at once.", "info");
    return;
  }
  update({ selected: [...state.selected, trialId] });
};

const publishCreation = async (id: string, options: { title: string; tags: string[]; publicOrigin: string; trialIds: string[] }): Promise<{ url: string }> => {
  const creation = state.creations.find((entry) => entry.id === id);
  if (!creation) throw new Error("This run is not in the local gallery.");
  const session = await authClient.getSession();
  if (!session.data?.user) throw new Error("Sign in to publish. Your runs stay local until you do.");

  const completed = creation.trials.filter((trial) => trial.status === "done" && trial.assetId && options.trialIds.includes(trial.id));
  if (completed.length === 0) throw new Error("Select at least one finished output.");
  if (completed.length > 16) throw new Error("Publish at most 16 outputs at a time.");

  const artifacts: PublishArtifactInput[] = [];
  for (const trial of completed) {
    const asset = state.assets[trial.assetId ?? ""];
    if (!asset) continue;
    artifacts.push({
      clientId: trial.id,
      prompt: trial.prompt,
      promptSource: trial.promptSource,
      llmId: trial.llmId,
      modelId: trial.modelId,
      mediaType: trial.medium,
      mime: asset.mime as PublishInput["artifacts"][number]["mime"],
      data: await blobToBase64(asset.blob),
      width: asset.width,
      height: asset.height,
      seed: trial.seed,
      costUsd: trial.costUsd,
      latencyMs: trial.latencyMs,
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

const openDetail = (id: string) => update({ detailId: id });
const closeDetail = () => update({ detailId: null });
const openSettings = () => update({ settingsOpen: true });
const closeSettings = () => update({ settingsOpen: false });
const openPublish = (id: string) => {
  const creation = state.creations.find((entry) => entry.id === id);
  if (!creation) return;
  if (!creation.trials.some((trial) => trial.status === "done")) {
    toast("Finish at least one output before publishing.", "info");
    return;
  }
  update({ publishId: id });
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
const setFilterModel = (modelId: string | null) => update({ filterModel: state.filterModel === modelId ? null : modelId });
const setFilterMedium = (filter: "all" | Medium) => update({ filterMedium: filter });
const setQuery = (query: string) => update({ query });
export const studio = {
  init,
  refreshModels,
  updateSettings,
  setMedium,
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
  closeDetail,
  openSettings,
  closeSettings,
  openPublish,
  closePublish,
  openCompare,
  closeCompare,
  setFilterModel,
  setFilterMedium,
  setQuery,
  dismissToast,
  toast,
};

export const useStudio = (): StudioState => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

export const findCreation = (state: StudioState, id: string | null): CreationRecord | undefined =>
  id ? state.creations.find((creation) => creation.id === id) : undefined;

export const findTrial = (state: StudioState, trialId: string): { creation: CreationRecord; trial: CreationRecord["trials"][number] } | null => {
  for (const creation of state.creations) {
    const trial = creation.trials.find((entry) => entry.id === trialId);
    if (trial) return { creation, trial };
  }
  return null;
};

export const uniqueModels = (creations: readonly CreationRecord[]): Array<{ id: string; name: string }> => {
  const seen = new Map<string, string>();
  for (const creation of creations) {
    for (const trial of creation.trials) {
      if (trial.status === "done") seen.set(trial.modelId, trial.modelName);
    }
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
};
