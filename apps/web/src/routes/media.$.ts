import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

/**
 * Published bytes live in the private R2 bucket and leave through this
 * origin-only route. The key is random and the bucket holds only published
 * objects. SVG is executable when navigated to directly, so it is served
 * under a sandbox CSP with no scripts, no framing, and no external loads.
 */
export const Route = createFileRoute("/media/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = decodeURIComponent(new URL(request.url).pathname.slice("/media/".length));
        if (!key.startsWith("published/")) return new Response("Not found", { status: 404 });

        const object = await env.FILES_BUCKET?.get(key);
        if (!object) return new Response("Not found", { status: 404 });

        const contentType = object.httpMetadata?.contentType ?? "application/octet-stream";
        const headers = new Headers({
          "content-type": contentType,
          "content-length": String(object.size),
          "cache-control": "public, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
          "cross-origin-resource-policy": "cross-origin",
        });
        if (object.httpEtag) headers.set("etag", object.httpEtag);
        if (contentType === "image/svg+xml") {
          headers.set("content-security-policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
          headers.set("content-disposition", "inline");
        }

        return new Response(object.body, { headers });
      },
    },
  },
});
