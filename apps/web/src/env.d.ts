declare module "cloudflare:workers" {
  export const env: {
    readonly BACKEND: { fetch(request: Request): Promise<Response> };
    readonly STAGE: string;
    readonly APP_NAME: string;
    readonly APP_ORIGIN?: string;
    readonly PUBLIC_ORIGIN?: string;
    /** String binding: "true" on the public catalog Worker. */
    readonly PUBLIC_MODE?: string;
    /**
     * Read-only binding to the private published-assets bucket. Present on
     * both Workers; the asset route only serves keys under `published/`.
     */
    readonly FILES_BUCKET?: {
      get(key: string): Promise<{
        readonly body: ReadableStream;
        readonly httpMetadata?: { readonly contentType?: string };
        readonly httpEtag?: string;
        readonly size: number;
      } | null>;
    };
  };
}
