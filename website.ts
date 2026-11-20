// The FRONTEND deploy units — TanStack Start (apps/web) built by
// `Cloudflare.Website.Vite`. Two Workers share one codebase and one build:
//
//   Website       the studio: composer, local gallery, settings, publishing.
//                 `PUBLIC_MODE=false`; its /api proxy uses the session cookie.
//   PublicWebsite the catalog: published runs only. `PUBLIC_MODE=true`; a
//                 separate origin with no composer and no key. It reads
//                 published objects from the private R2 bucket through a
//                 read-only binding, so the canonical share URL never leaks
//                 a signed R2 URL.
//
// Both forward /api to the same private backend over the BACKEND service
// binding, and both can serve /assets/:key from the bucket. The app origin
// can render a publication detail as a fallback when no root domain is set;
// the public origin is the canonical share surface.
//
// This file lives at the workspace ROOT, deliberately OUTSIDE apps/web:
// `Website.Vite` content-hashes every non-gitignored file under `rootDir` to
// decide rebuilds — an IaC file inside apps/web would rebuild + redeploy the
// frontend on every deploy-shape edit. The backend's declaration lives in its
// app because worker.ts IS the Worker's runtime module; the Vite site has no
// such file, so the root — where the IaC toolchain already lives
// (alchemy.run.ts, tsconfig.iac.json) — is the honest home.

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { ALCHEMY_DEV } from "alchemy/Phase";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { Path } from "effect/Path";
import Backend from "./apps/backend/src/worker.ts";
import { devPort, publicWebsiteDomain, websiteDomain } from "./apps/backend/config/domain.ts";
import { FilesBucket } from "./apps/backend/config/storage.ts";

const websiteDeployProps = Effect.gen(function* () {
  const path = yield* Path;
  const webPort = yield* devPort("web-");
  const publicWebPort = yield* devPort("public-web-");
  const host = yield* websiteDomain;
  const publicHost = yield* publicWebsiteDomain;
  const isDev = yield* Effect.orDie(ALCHEMY_DEV);
  const stage = yield* Effect.serviceOption(Alchemy.Stage).pipe(Effect.map((service) => (service._tag === "Some" ? service.value : "")));
  const appName = yield* Config.String("APP_NAME").pipe(Config.withDefault("App"), Effect.orDie);

  // Yielding the SAME Worker entry the stack deploys registers/dedupes it by
  // logical id — this is what makes the BACKEND service binding point at the
  // stage's own backend Worker. The bucket is deduped the same way; both sites
  // get a read/write binding, but only the backend's publish route writes.
  const backend = yield* Backend;
  const bucket = yield* FilesBucket;

  const appOrigin = isDev ? `http://localhost:${webPort}` : host ? `https://${host}` : "";
  const publicOrigin = isDev ? `http://localhost:${publicWebPort}` : publicHost ? `https://${publicHost}` : "";

  const shared = {
    rootDir: path.resolve(new URL(".", import.meta.url).pathname, "apps/web"),
    compatibility: {
      date: "2026-07-11",
      // nodejs_compat: React SSR + the effect/http client on the SSR
      // data path; enable_request_signal: TanStack Start's loader signals.
      flags: ["nodejs_compat", "enable_request_signal"],
    },
    observability: {
      enabled: true,
      headSamplingRate: 0.1,
      logs: { enabled: true, invocationLogs: true, headSamplingRate: 0.1 },
      traces: { enabled: true, headSamplingRate: 0.01 },
    },
    memo: {
      // The site imports @app/backend/contract (a sibling workspace
      // package); the default hash scope only covers apps/web, so the shared
      // contract sources are added explicitly and the lockfile stays in the
      // hash (providing `include` drops it otherwise).
      include: ["**/*", "../backend/src/contracts/**", "../backend/src/views/**"],
      lockfile: true,
    },
    env: {
      BACKEND: backend,
      STAGE: stage,
      APP_NAME: appName,
      APP_ORIGIN: appOrigin,
      PUBLIC_ORIGIN: publicOrigin,
      FILES_BUCKET: bucket,
    },
  };

  return {
    shared,
    isDev,
    host,
    publicHost,
    webPort,
    publicWebPort,
  };
});

export class Website extends Cloudflare.Website.Vite<Website>()(
  "Website",
  Effect.gen(function* () {
    const { shared, isDev, host, webPort } = yield* websiteDeployProps;
    return {
      ...shared,
      env: { ...shared.env, PUBLIC_MODE: "false" },
      ...(isDev ? { dev: { port: webPort, strictPort: true } } : host ? { domain: host, workersDev: false } : { workersDev: true }),
    };
  }),
) {}

export class PublicWebsite extends Cloudflare.Website.Vite<PublicWebsite>()(
  "PublicWebsite",
  Effect.gen(function* () {
    const { shared, isDev, publicHost, publicWebPort } = yield* websiteDeployProps;
    return {
      ...shared,
      env: { ...shared.env, PUBLIC_MODE: "true" },
      ...(isDev ? { dev: { port: publicWebPort, strictPort: true } } : publicHost ? { domain: publicHost, workersDev: false } : { workersDev: true }),
    };
  }),
) {}

export type WebsiteEnv = Cloudflare.InferEnv<typeof Website>;
