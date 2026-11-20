/**
 * The publish wire format, shared by the browser and the backend.
 *
 * Assets travel as base64 in one JSON body. A publication is a small,
 * curated snapshot (max 16 artifacts, max 32 MiB decoded), not a bulk
 * export. The cap is enforced in the domain before a single R2 write.
 */
/** The authenticated identity passed from the Better Auth session into the domain. */
export interface PublicationUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

export const MAX_PUBLISH_ARTIFACTS = 16;
export const MAX_PUBLISH_BYTES = 32 * 1024 * 1024;
export const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;

export type PublishMode = "compose" | "direct";
export type PublishMedium = "image" | "svg";
export type PublishMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/svg+xml";

export const PUBLISH_MIMES: readonly PublishMime[] = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];

export interface PublishArtifactInput {
  readonly clientId: string;
  readonly prompt: string;
  readonly promptSource: string;
  readonly llmId: string | null;
  readonly modelId: string;
  readonly mediaType: PublishMedium;
  readonly mime: PublishMime;
  /** Base64, no `data:` prefix. */
  readonly data: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly seed: number | null;
  readonly costUsd: number | null;
  readonly latencyMs: number | null;
}

export interface PublishInput {
  /** The local creation id. Re-publishing the same id replaces the snapshot. */
  readonly clientId: string;
  readonly title: string;
  readonly brief: string;
  readonly mode: PublishMode;
  readonly medium: PublishMedium;
  readonly tags: readonly string[];
  /** ISO-8601, the local creation time. */
  readonly createdAt: string;
  readonly artifacts: readonly PublishArtifactInput[];
}

export interface PublishResponse {
  readonly id: string;
  readonly handle: string;
  /** Relative to the public origin. */
  readonly path: string;
}

export interface PublicArtifact {
  readonly id: string;
  readonly prompt: string;
  readonly promptSource: string;
  readonly llmId: string | null;
  readonly modelId: string;
  readonly mediaType: PublishMedium;
  readonly mime: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly seed: number | null;
  readonly costUsd: number | null;
  readonly latencyMs: number | null;
  /** Relative to the public origin. */
  readonly assetPath: string;
}

export interface PublicationSummary {
  readonly id: string;
  readonly handle: string;
  readonly displayName: string;
  readonly title: string;
  readonly brief: string;
  readonly mode: PublishMode;
  readonly medium: PublishMedium;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly artifactCount: number;
  readonly models: readonly string[];
  readonly coverAssetPath: string | null;
}

export interface PublicationDetail extends PublicationSummary {
  readonly artifacts: readonly PublicArtifact[];
}

export interface FeedResponse {
  readonly publications: readonly PublicationSummary[];
}

export interface PublishError {
  readonly error: string;
}
