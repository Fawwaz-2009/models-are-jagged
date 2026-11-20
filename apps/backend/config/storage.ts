import * as Cloudflare from "alchemy/Cloudflare";
import { Context, Effect, Layer } from "effect";

/**
 * Published bytes and local outputs never share a store: the local studio
 * keeps its gallery in IndexedDB, and only a publish snapshot is written here.
 * The bucket is private; both Websites read it through a binding, and the
 * backend writes and deletes. No presigned URLs, no S3 credentials, no
 * second copy of the object in a public bucket.
 */
export const FilesBucket = Cloudflare.R2.Bucket("Files");

export class Files extends Context.Service<Files>()("Files", {
  make: Effect.gen(function* () {
    const client = yield* Cloudflare.R2.ReadWriteBucket(FilesBucket);
    return { ...client };
  }),
}) {
  static readonly Live = Layer.effect(this, this.make).pipe(Layer.provide(Cloudflare.R2.ReadWriteBucketBinding));
}
