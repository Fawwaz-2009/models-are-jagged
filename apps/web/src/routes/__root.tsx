import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import type { ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";
import appCss from "../styles.css?url";
import geistFont from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";

interface RouterContext {
  queryClient: QueryClient;
}

/**
 * Runtime identity from the Worker's bindings. `PUBLIC_MODE` is the one
 * switch between the two deploy units: the studio (composer, local gallery,
 * publishing) and the public catalog (published runs only). Both read the
 * same code and the same backend; only the shell and the write actions differ.
 */
export const getAppMeta = createServerFn({ method: "GET" }).handler(async () => {
  const appOrigin = (env.APP_ORIGIN as string | undefined) ?? "";
  const publicOrigin = (env.PUBLIC_ORIGIN as string | undefined) ?? "";
  const publicMode = (env.PUBLIC_MODE as string | undefined) === "true";
  return {
    appName: (env.APP_NAME as string | undefined) ?? "models are jagged",
    stage: (env.STAGE as string | undefined) ?? "",
    appOrigin,
    publicOrigin,
    publicMode,
    url: publicMode ? publicOrigin : appOrigin,
  };
});

export const Route = createRootRouteWithContext<RouterContext>()({
  loader: () => getAppMeta(),
  head: ({ match }) => {
    const { appName, url } = match.loaderData ?? { appName: "App", url: "" };
    const description = match.loaderData?.publicMode
      ? "A public catalog of runs: one brief, many models, every output side by side."
      : "A local-first studio for comparing one brief across language models and image models. Your key stays in your browser.";
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: appName },
        { name: "description", content: description },
        { property: "og:title", content: appName },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        ...(url
          ? [
              { property: "og:url", content: url },
              { property: "og:image", content: `${url}/og.png` },
              { property: "og:image:width", content: "1200" },
              { property: "og:image:height", content: "630" },
              { name: "twitter:card", content: "summary_large_image" },
              { name: "twitter:image", content: `${url}/og.png` },
            ]
          : [{ name: "twitter:card", content: "summary" }]),
        { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#ffffff" },
        { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#09090b" },
      ],
      // The font is discovered only after the stylesheet parses, which leaves the
      // first paint in a fallback face. Preloading races it with the CSS instead.
      links: [
        ...(url ? [{ rel: "canonical", href: url }] : []),
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "stylesheet", href: appCss },
        { rel: "preload", href: geistFont, as: "font", type: "font/woff2", crossOrigin: "anonymous" as const },
      ],
    };
  },
  component: RootComponent,
  // Without this, any request that 404s during dev teardown logs the router's
  // "notFoundError was encountered" warning on shutdown.
  notFoundComponent: NotFound,
});

function RootComponent() {
  return (
    <Document>
      <Outlet />
    </Document>
  );
}

function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">The page you asked for does not exist.</p>
      <a className="mt-6 inline-block rounded-lg border border-zinc-200 px-4 py-2 font-semibold hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900" href="/">
        Back to the start
      </a>
    </main>
  );
}

function Document({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-[var(--paper)] font-sans text-[var(--ink)] antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
