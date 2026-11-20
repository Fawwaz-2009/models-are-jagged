export type RunMode = "compose" | "direct";
export type Medium = "image" | "svg";
export type TrialStatus = "queued" | "composing" | "rendering" | "done" | "error" | "cancelled";

export interface ModelInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly contextLength: number | null;
  readonly outputModalities: readonly string[];
  readonly inputModalities: readonly string[];
}

export interface ModelState {
  readonly text: readonly ModelInfo[];
  readonly image: readonly ModelInfo[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly fetchedAt: number | null;
}

export interface TrialRecord {
  id: string;
  creationId: string;
  /** The model that wrote the prompt, or null when the brief is the prompt. */
  llmId: string | null;
  llmName: string | null;
  /** The model that rendered the artifact. */
  modelId: string;
  modelName: string;
  medium: Medium;
  prompt: string;
  /** "You" for a direct brief, otherwise the prompt model's name. */
  promptSource: string;
  status: TrialStatus;
  error: string | null;
  assetId: string | null;
  seed: number | null;
  costUsd: number | null;
  latencyMs: number | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface PublishedRef {
  id: string;
  handle: string;
  url: string;
  at: string;
}

export interface CreationRecord {
  id: string;
  createdAt: string;
  brief: string;
  mode: RunMode;
  medium: Medium;
  promptLlmIds: string[];
  rendererIds: string[];
  aspectRatio: string;
  variants: number;
  baseSeed: number;
  referenceAssetId: string | null;
  /** One compose call per prompt model; kept separate from per-render cost. */
  promptCostUsd: number;
  trials: TrialRecord[];
  published: PublishedRef | null;
}

export interface AssetRecord {
  id: string;
  creationId: string;
  trialId: string | null;
  kind: "output" | "reference";
  mime: string;
  blob: Blob;
  width: number | null;
  height: number | null;
  /** Present for SVG so copy works without reading the blob. */
  text: string | null;
}

export interface Settings {
  apiKey: string;
  mode: RunMode;
  medium: Medium;
  promptModelIds: string[];
  rendererIds: string[];
  aspectRatio: string;
  variants: number;
  seedMode: "random" | "fixed";
  fixedSeed: number;
}

export interface Toast {
  id: string;
  message: string;
  tone: "info" | "error" | "success";
}

export interface RunRequest {
  brief: string;
  mode: RunMode;
  medium: Medium;
  promptLlmIds: string[];
  rendererIds: string[];
  aspectRatio: string;
  variants: number;
  baseSeed: number;
  reference: { blob: Blob; dataUrl: string; mime: string } | null;
}

export const ASPECT_RATIOS = ["1:1", "4:5", "3:4", "16:9", "9:16", "3:2"] as const;

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  mode: "compose",
  medium: "image",
  promptModelIds: [],
  rendererIds: [],
  aspectRatio: "1:1",
  variants: 1,
  seedMode: "random",
  fixedSeed: 42,
};
