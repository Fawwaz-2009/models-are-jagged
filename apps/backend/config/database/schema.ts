import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * A creator handle is the public identity: one per account, unique, stable.
 * It exists separately from the auth user because the auth row is private and
 * its name/email can change; a published URL must not.
 */
export const Creator = sqliteTable("creators", {
  userId: text("user_id").primaryKey(),
  handle: text("handle").notNull().unique(),
  displayName: text("display_name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** One published run: a brief plus every artifact that came out of it. */
export const Publication = sqliteTable(
  "publications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    clientId: text("client_id").notNull(),
    handle: text("handle").notNull(),
    displayName: text("display_name").notNull(),
    title: text("title").notNull(),
    brief: text("brief").notNull(),
    mode: text("mode").notNull(),
    medium: text("medium").notNull(),
    tags: text("tags").notNull().default("[]"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("publications_user_id_idx").on(table.userId),
    index("publications_handle_idx").on(table.handle),
    index("publications_created_at_idx").on(table.createdAt),
    uniqueIndex("publications_user_client_idx").on(table.userId, table.clientId),
  ],
);

/**
 * An artifact is immutable provenance: the prompt, the prompt source, the
 * renderer, the renderer parameters, and the bytes in R2. The public URL is
 * derived from the random R2 key, never from user input.
 */
export const PublishedArtifact = sqliteTable(
  "published_artifacts",
  {
    id: text("id").primaryKey(),
    publicationId: text("publication_id").notNull(),
    prompt: text("prompt").notNull(),
    promptSource: text("prompt_source").notNull(),
    llmId: text("llm_id"),
    modelId: text("model_id").notNull(),
    mediaType: text("media_type").notNull(),
    mime: text("mime").notNull(),
    assetKey: text("asset_key").notNull(),
    width: integer("width"),
    height: integer("height"),
    seed: integer("seed"),
    costUsd: text("cost_usd"),
    latencyMs: integer("latency_ms"),
    sort: integer("sort").notNull().default(0),
  },
  (table) => [index("published_artifacts_publication_idx").on(table.publicationId)],
);
