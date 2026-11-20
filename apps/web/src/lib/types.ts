export type RunMode = "compose" | "direct";
export type Medium = "image" | "svg";
export type ModelApi = "chat" | "images";
export type OutputStatus = "queued" | "composing" | "rendering" | "done" | "error" | "cancelled";

export interface ModelInfo {
  readonly id: string;
  readonly name: string;
  readonly created: number | null;
  readonly outputModalities: readonly string[];
  readonly inputModalities: readonly string[];
  /** Chat Completions image models and Image API image models are separate lanes. */
  readonly api?: ModelApi;
  readonly supportsAspectRatio?: boolean;
  readonly supportsReferences?: boolean;
}

export interface ModelState {
  readonly text: readonly ModelInfo[];
  readonly image: readonly ModelInfo[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly fetchedAt: number | null;
}

export interface OutputRecord {
  id: string;
  creationId: string;
  llmId: string | null;
  llmName: string | null;
  modelId: string;
  modelName: string;
  medium: Medium;
  prompt: string;
  promptSource: string;
  status: OutputStatus;
  error: string | null;
  assetId: string | null;
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
  referenceAssetIds: string[];
  outputs: OutputRecord[];
  published: PublishedRef | null;
}

export interface AssetRecord {
  id: string;
  creationId: string;
  outputId: string | null;
  kind: "output" | "reference";
  mime: string;
  blob: Blob;
  width: number | null;
  height: number | null;
  text: string | null;
}

export interface Settings {
  apiKey: string;
  medium: Medium;
  /** Empty means "use the brief as written"; one or more models refines it. */
  promptModelIds: string[];
  rendererIds: string[];
  aspectRatio: string;
}

export interface Toast {
  id: string;
  message: string;
  tone: "info" | "error" | "success";
  leaving: boolean;
}

export interface ReferenceInput {
  blob: Blob;
  dataUrl: string;
  mime: string;
}

export interface RunRequest {
  brief: string;
  medium: Medium;
  /** Empty means "use the brief as written". */
  promptLlmIds: string[];
  rendererIds: string[];
  aspectRatio: string;
  references: ReferenceInput[];
}

export const ASPECT_RATIOS = ["1:1", "4:5", "3:4", "16:9", "9:16", "3:2"] as const;

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  medium: "image",
  promptModelIds: [],
  rendererIds: [],
  aspectRatio: "1:1",
};
