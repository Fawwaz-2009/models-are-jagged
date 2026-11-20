import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { ALCHEMY_DEV } from "alchemy/Phase";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter, HttpServerResponse } from "effect/http";
import { HttpServerRequest } from "effect/http/HttpServerRequest";
import { Auth } from "../config/auth.ts";
import { AppDatabase } from "../config/database/index.ts";
import { devPort, publicWebsiteDomain, websiteDomain } from "../config/domain.ts";
import * as Config from "effect/Config";
import { clientIp, RateLimits } from "../config/rate-limit.ts";
import { Files } from "../config/storage.ts";
import { PublicationFailure, Publications, PublicationsLive } from "./domain/publications.ts";
import type { PublishInput } from "./contracts/publications.ts";

/**
 * The Worker entry — the Init gen constructs each service once and builds the
 * services the routes close over; the discharge edge provides every remaining
 * requirement INTO the router, before `toHttpEffect`, so the fetch that
 * reaches alchemy requires only what alchemy serves per request.
 */

/** Raw publication routes answer Web-shaped JSON; failures stay typed by status. */
const json = (body: unknown, status = 200) => HttpServerResponse.jsonUnsafe(body, { status });
const errorJson = (status: number, message: string) => json({ error: message }, status);

export default class Backend extends Cloudflare.Worker<Backend>()(
  "Backend",
  // The props read the ambient stage at synthesis; the deployed Worker
  // re-evaluates them without infrastructure context, where the
  // production-shaped fallback keeps the object total and unused.
  Effect.gen(function* () {
    const port = yield* devPort();
    const isDev = yield* Effect.orDie(ALCHEMY_DEV);
    const websiteUrl = yield* websiteDomain;
    const publicWebsiteUrl = yield* publicWebsiteDomain;
    return {
      main: import.meta.filename,
      workersDev: false,
      compatibility: {
        date: "2026-07-11",
        flags: ["nodejs_compat", "enable_request_signal"],
      },
      observability: {
        enabled: true,
        headSamplingRate: 0.1,
        logs: { enabled: true, invocationLogs: true, headSamplingRate: 0.1 },
        traces: { enabled: true, headSamplingRate: 0.01 },
      },
      // Parallel `alchemy dev` sessions isolate by STAGE with a deterministic
      // port; strictPort turns a port collision into a loud error instead of a
      // silent drift.
      ...(isDev ? { dev: { port, strictPort: true } } : {}),
      env: {
        AUTH_EMAIL_FROM: yield* (isDev ? Config.String("AUTH_EMAIL_FROM").pipe(Config.withDefault("App <noreply@localhost>")) : Config.String("AUTH_EMAIL_FROM")).pipe(
          Effect.orDie,
        ),
        // Without ROOT_DOMAIN the site lives on the platform host, and the
        // wildcard admits whatever `<name>.<account>.workers.dev` resolves
        // to. With one, only the stage's custom host is trusted.
        AUTH_ALLOWED_HOSTS: `localhost:*,127.0.0.1:*,${websiteUrl ?? "*.workers.dev"}${publicWebsiteUrl ? `,${publicWebsiteUrl}` : ""}`,
      },
    };
  }),
  Effect.gen(function* () {
    // Init-time construction: better-auth gets its D1 adapter and the email
    // sender is built once, not per request.
    const authInstance = yield* Effect.provide(Auth, Auth.Live);
    const rateLimits = yield* Effect.provide(RateLimits, RateLimits.Live);

    // Better Auth: its own framework, mounted as a raw catch-all before the
    // typed API. Tier 2 sits in front: 5 auth requests per minute per IP.
    // Every auth request can cost a real email, so floods stop here before
    // Better Auth's per-route D1 limits even run.
    const AuthRoutesLive = HttpRouter.addAll([
      HttpRouter.route(
        "*",
        "/api/auth/*",
        Effect.gen(function* () {
          const request = yield* HttpServerRequest;
          const allowed = yield* rateLimits.auth(`auth:${clientIp(request)}`);
          if (!allowed.success) return rateLimits.tooManyRequests;
          return yield* authInstance.fetch;
        }),
      ),
    ]);

    // The publication surface deliberately sits outside the typed HttpApi:
    // the payload carries base64 bytes, and the public feed is consumed by
    // both Workers through the same JSON shape. Auth still comes from the
    // shared Better Auth instance; the public reads never touch it.
    const PublicationRoutesLive = HttpRouter.addAll([
      HttpRouter.route(
        "POST",
        "/api/publish",
        Effect.gen(function* () {
          const request = yield* HttpServerRequest;
          const contentLength = Number(request.headers["content-length"] ?? "0");
          if (Number.isFinite(contentLength) && contentLength > 45 * 1024 * 1024) {
            return errorJson(413, "The publication is larger than 45 MiB on the wire.");
          }

          const session = yield* authInstance.getSession(new Headers(request.headers)).pipe(Effect.orDie);
          if (!session?.user) return errorJson(401, "Sign in to publish.");

          const body = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null)));
          if (body === null || typeof body !== "object") return errorJson(400, "Send a JSON publication.");

          const publications = yield* Publications;
          const result = yield* publications
            .publish(
              {
                id: session.user.id,
                email: session.user.email,
                name: session.user.name || session.user.email,
              },
              body as unknown as PublishInput,
            )
            .pipe(Effect.catch((error) => Effect.succeed(error)));

          if (result instanceof PublicationFailure) return errorJson(result.status, result.message);
          return json(result);
        }),
      ),
      HttpRouter.route(
        "DELETE",
        "/api/publications/:id",
        Effect.gen(function* () {
          const request = yield* HttpServerRequest;
          const session = yield* authInstance.getSession(new Headers(request.headers)).pipe(Effect.orDie);
          if (!session?.user) return errorJson(401, "Sign in to unpublish.");

          const url = new URL(request.url);
          const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
          if (!id) return errorJson(400, "Missing publication id.");

          const publications = yield* Publications;
          const result = yield* publications
            .unpublish(
              {
                id: session.user.id,
                email: session.user.email,
                name: session.user.name || session.user.email,
              },
              id,
            )
            .pipe(Effect.catch((error) => Effect.succeed(error)));

          if (result instanceof PublicationFailure) return errorJson(result.status, result.message);
          return json(result);
        }),
      ),
      HttpRouter.route(
        "GET",
        "/api/public/feed",
        Effect.gen(function* () {
          const request = yield* HttpServerRequest;
          const url = new URL(request.url);
          const handle = url.searchParams.get("handle")?.trim() || undefined;
          const requested = Number(url.searchParams.get("limit") ?? 48);
          const limit = Number.isFinite(requested) ? requested : 48;
          const publications = yield* Publications;
          return json(yield* publications.feed(handle, limit));
        }),
      ),
      HttpRouter.route(
        "GET",
        "/api/public/publications/:id",
        Effect.gen(function* () {
          const request = yield* HttpServerRequest;
          const url = new URL(request.url);
          const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
          if (!id) return errorJson(400, "Missing publication id.");
          const publications = yield* Publications;
          const detail = yield* publications.publication(id);
          if (!detail) return errorJson(404, "Publication not found.");
          return json(detail);
        }),
      ),
    ]);

    // The discharge edge: everything the routes need is provided HERE, before
    // toHttpEffect, so the resulting fetch carries no requirements that
    // alchemy cannot satisfy per request.

    const appLayer = Layer.mergeAll(AuthRoutesLive, PublicationRoutesLive).pipe(
      HttpRouter.provideRequest(PublicationsLive),
      Layer.provide(AppDatabase.Live),
      Layer.provide(Files.Live),
      Layer.provide(Alchemy.RuntimeContext.phantom),
    );
    const app = yield* HttpRouter.toHttpEffect(appLayer);

    // Tier 1 wraps EVERYTHING the backend serves (typed API, auth mount):
    // 300 requests per minute per IP. A bad-actor clamp, never a
    // domain rule, so it answers plain HTTP 429 + Retry-After rather than a
    // typed contract error.
    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const allowed = yield* rateLimits.global(`ip:${clientIp(request)}`);
        if (!allowed.success) return rateLimits.tooManyRequests;
        return yield* app;
      }),
    };
  }),
) {}
