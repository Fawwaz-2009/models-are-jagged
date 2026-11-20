/**
 * Publication is the one write path from the local studio to the public
 * catalog. The local app owns the source of truth; this service stores a
 * snapshot with immutable provenance and random R2 keys, so the public
 * catalog can render a run without ever trusting a client-controlled URL.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { AppDatabase } from "../../config/database/index.ts";
import { Files } from "../../config/storage.ts";
import { Creator, Publication, PublishedArtifact } from "../../config/database/schema.ts";
import type {
  FeedResponse,
  PublicArtifact,
  PublicationDetail,
  PublicationSummary,
  PublishArtifactInput,
  PublishInput,
  PublishMime,
  PublishResponse,
  PublicationUser,
} from "../contracts/publications.ts";
import { MAX_ARTIFACT_BYTES, MAX_PUBLISH_ARTIFACTS, MAX_PUBLISH_BYTES, PUBLISH_MIMES } from "../contracts/publications.ts";

export class PublicationFailure extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PublicationFailure";
    this.status = status;
  }
}

const fail = (status: number, message: string) => new PublicationFailure(status, message);

const extensionByMime: Record<PublishMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

const mimeSet = new Set<string>(PUBLISH_MIMES);

const decodeBase64 = (value: string): Uint8Array => {
  const raw = atob(value);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
  return bytes;
};

const slugify = (value: string): string => {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug.length > 0 ? slug : "artist";
};

const parseTags = (value: string): readonly string[] => {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
};

const artifactView = (row: typeof PublishedArtifact.$inferSelect): PublicArtifact => ({
  id: row.id,
  prompt: row.prompt,
  promptSource: row.promptSource,
  llmId: row.llmId,
  modelId: row.modelId,
  mediaType: row.mediaType === "svg" ? "svg" : "image",
  mime: row.mime,
  width: row.width,
  height: row.height,
  seed: row.seed,
  costUsd: row.costUsd === null ? null : Number(row.costUsd),
  latencyMs: row.latencyMs,
  assetPath: `/media/${row.assetKey}`,
});

const summaryView = (row: typeof Publication.$inferSelect, artifacts: ReadonlyArray<typeof PublishedArtifact.$inferSelect>): PublicationSummary => {
  const models = [...new Set(artifacts.map((artifact) => artifact.modelId))];
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.displayName,
    title: row.title,
    brief: row.brief,
    mode: row.mode === "compose" ? "compose" : "direct",
    medium: row.medium === "svg" ? "svg" : "image",
    tags: parseTags(row.tags),
    createdAt: row.createdAt.toISOString(),
    artifactCount: artifacts.length,
    models,
    coverAssetPath: artifacts[0] ? `/media/${artifacts[0].assetKey}` : null,
  };
};

const validate = (input: PublishInput): void => {
  if (typeof input.clientId !== "string" || input.clientId.length < 1 || input.clientId.length > 120) throw fail(400, "Invalid creation id.");
  if (typeof input.title !== "string" || input.title.trim().length < 1 || input.title.length > 140) throw fail(400, "Title must be 1 to 140 characters.");
  if (typeof input.brief !== "string" || input.brief.trim().length < 1 || input.brief.length > 4000) throw fail(400, "Brief must be 1 to 4000 characters.");
  if (input.mode !== "compose" && input.mode !== "direct") throw fail(400, "Invalid mode.");
  if (input.medium !== "image" && input.medium !== "svg") throw fail(400, "Invalid medium.");
  if (!Array.isArray(input.artifacts) || input.artifacts.length < 1) throw fail(400, "Publish at least one artifact.");
  if (input.artifacts.length > MAX_PUBLISH_ARTIFACTS) throw fail(400, `Publish at most ${MAX_PUBLISH_ARTIFACTS} artifacts at a time.`);
  if (!Array.isArray(input.tags) || input.tags.length > 8) throw fail(400, "At most 8 tags.");
  const totalBytes = input.artifacts.reduce((total, artifact) => total + Math.ceil(artifact.data.length * 0.75), 0);
  if (totalBytes > MAX_PUBLISH_BYTES) throw fail(413, "The publication is larger than 32 MiB.");
  for (const artifact of input.artifacts) {
    if (typeof artifact.data !== "string" || !mimeSet.has(artifact.mime)) throw fail(400, "Each artifact needs a supported image or SVG.");
    if (artifact.data.length === 0 || Math.ceil(artifact.data.length * 0.75) > MAX_ARTIFACT_BYTES) throw fail(413, "Each artifact must be at most 8 MiB.");
    if (artifact.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(artifact.data)) throw fail(400, "An artifact is not valid base64.");
    if (artifact.prompt.length > 8000) throw fail(400, "A prompt is too long.");
    if (artifact.modelId.length > 200 || artifact.promptSource.length > 200 || (artifact.llmId?.length ?? 0) > 200) throw fail(400, "A model id is too long.");
  }
};

const makePublications = Effect.gen(function* () {
  const db = yield* AppDatabase;
  const files = yield* Files;

  const creatorFor = (user: PublicationUser) =>
    Effect.gen(function* () {
      const existing = yield* db.select().from(Creator).where(eq(Creator.userId, user.id)).limit(1).pipe(Effect.orDie);
      if (existing[0]) return existing[0];
      const base = slugify(user.name || user.email.split("@")[0] || "artist");
      let handle = base;
      for (let attempt = 2; attempt < 60; attempt++) {
        const taken = yield* db.select({ userId: Creator.userId }).from(Creator).where(eq(Creator.handle, handle)).limit(1).pipe(Effect.orDie);
        if (!taken[0]) break;
        handle = `${base}-${attempt}`;
      }
      yield* db
        .insert(Creator)
        .values({ userId: user.id, handle, displayName: user.name || user.email })
        .onConflictDoNothing()
        .pipe(Effect.orDie);
      const created = yield* db.select().from(Creator).where(eq(Creator.userId, user.id)).limit(1).pipe(Effect.orDie);
      if (!created[0]) return yield* Effect.fail(fail(500, "Could not create a creator handle."));
      return created[0];
    });

  const removePublication = (publicationId: string) =>
    Effect.gen(function* () {
      const artifacts = yield* db.select().from(PublishedArtifact).where(eq(PublishedArtifact.publicationId, publicationId)).pipe(Effect.orDie);
      yield* Effect.forEach(artifacts, (artifact) => files.delete(artifact.assetKey).pipe(Effect.ignore), { concurrency: 4 });
      yield* db.delete(PublishedArtifact).where(eq(PublishedArtifact.publicationId, publicationId)).pipe(Effect.orDie);
      yield* db.delete(Publication).where(eq(Publication.id, publicationId)).pipe(Effect.orDie);
    });

  return {
    publish: (user: PublicationUser, input: PublishInput) =>
      Effect.gen(function* () {
        yield* Effect.try({ try: () => validate(input), catch: (error) => (error instanceof PublicationFailure ? error : fail(400, "Invalid publication.")) });
        const creator = yield* creatorFor(user);
        const previous = yield* db
          .select({ id: Publication.id })
          .from(Publication)
          .where(and(eq(Publication.userId, user.id), eq(Publication.clientId, input.clientId)))
          .limit(1)
          .pipe(Effect.orDie);
        const previousId = previous[0]?.id;
        if (previousId) yield* removePublication(previousId);

        // Reusing the id keeps a shared URL stable across republication.
        const id = previousId ?? crypto.randomUUID();
        const createdAt = Number.isNaN(Date.parse(input.createdAt)) ? new Date() : new Date(input.createdAt);
        const tags = [...new Set(input.tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0 && tag.length <= 32))].slice(0, 8);

        yield* db
          .insert(Publication)
          .values({
            id,
            userId: user.id,
            clientId: input.clientId,
            handle: creator.handle,
            displayName: creator.displayName,
            title: input.title.trim(),
            brief: input.brief.trim(),
            mode: input.mode,
            medium: input.medium,
            tags: JSON.stringify(tags),
            createdAt,
          })
          .pipe(Effect.orDie);

        const written: string[] = [];
        yield* Effect.forEach(
          input.artifacts,
          (artifact: PublishArtifactInput, index) =>
            Effect.gen(function* () {
              const mime = artifact.mime;
              const artifactId = crypto.randomUUID();
              const key = `published/${id}/${artifactId}.${extensionByMime[mime]}`;
              const bytes = decodeBase64(artifact.data);
              yield* files.put(key, bytes, { httpMetadata: { contentType: mime } }).pipe(Effect.mapError(() => fail(500, "Could not store the publication.")));
              written.push(key);
              yield* db
                .insert(PublishedArtifact)
                .values({
                  id: artifactId,
                  publicationId: id,
                  prompt: artifact.prompt,
                  promptSource: artifact.promptSource,
                  llmId: artifact.llmId,
                  modelId: artifact.modelId,
                  mediaType: artifact.mediaType,
                  mime,
                  assetKey: key,
                  width: artifact.width,
                  height: artifact.height,
                  seed: artifact.seed,
                  costUsd: artifact.costUsd === null ? null : String(artifact.costUsd),
                  latencyMs: artifact.latencyMs,
                  sort: index,
                })
                .pipe(Effect.orDie);
            }).pipe(
              Effect.catch((error) =>
                Effect.gen(function* () {
                  yield* Effect.forEach(written, (key) => files.delete(key).pipe(Effect.ignore), { concurrency: 4 });
                  yield* db.delete(PublishedArtifact).where(eq(PublishedArtifact.publicationId, id)).pipe(Effect.orDie);
                  yield* db.delete(Publication).where(eq(Publication.id, id)).pipe(Effect.orDie);
                  return yield* Effect.fail(error instanceof PublicationFailure ? error : fail(500, "Could not store the publication."));
                }),
              ),
            ),
          { concurrency: 3 },
        );

        return { id, handle: creator.handle, path: `/p/${id}` } satisfies PublishResponse;
      }),

    unpublish: (user: PublicationUser, id: string) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select({ id: Publication.id })
          .from(Publication)
          .where(and(eq(Publication.id, id), eq(Publication.userId, user.id)))
          .limit(1)
          .pipe(Effect.orDie);
        if (!rows[0]) return yield* Effect.fail(fail(404, "Publication not found."));
        yield* removePublication(id);
        return { id };
      }),

    feed: (handle: string | undefined, limit = 48) =>
      Effect.gen(function* () {
        const bounded = Math.max(1, Math.min(96, limit));
        const rows = yield* (
          handle
            ? db.select().from(Publication).where(eq(Publication.handle, handle)).orderBy(desc(Publication.createdAt)).limit(bounded)
            : db.select().from(Publication).orderBy(desc(Publication.createdAt)).limit(bounded)
        ).pipe(Effect.orDie);
        const ids = rows.map((row) => row.id);
        const artifacts = ids.length
          ? yield* db.select().from(PublishedArtifact).where(inArray(PublishedArtifact.publicationId, ids)).orderBy(asc(PublishedArtifact.sort)).pipe(Effect.orDie)
          : [];
        const byPublication = new Map<string, Array<typeof PublishedArtifact.$inferSelect>>();
        for (const artifact of artifacts) {
          const list = byPublication.get(artifact.publicationId) ?? [];
          list.push(artifact);
          byPublication.set(artifact.publicationId, list);
        }
        return { publications: rows.map((row) => summaryView(row, byPublication.get(row.id) ?? [])) } satisfies FeedResponse;
      }),

    publication: (id: string) =>
      Effect.gen(function* () {
        const rows = yield* db.select().from(Publication).where(eq(Publication.id, id)).limit(1).pipe(Effect.orDie);
        const row = rows[0];
        if (!row) return null;
        const artifacts = yield* db
          .select()
          .from(PublishedArtifact)
          .where(eq(PublishedArtifact.publicationId, id))
          .orderBy(asc(PublishedArtifact.sort))
          .pipe(Effect.orDie);
        return { ...summaryView(row, artifacts), artifacts: artifacts.map(artifactView) } satisfies PublicationDetail;
      }),
  };
});

export type PublicationsShape = Effect.Success<typeof makePublications>;

export class Publications extends Context.Service<Publications, PublicationsShape>()("@app/Publications") {}

export const PublicationsLive = Layer.effect(Publications, makePublications);
