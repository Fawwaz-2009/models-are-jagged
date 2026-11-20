import type { FeedResponse, PublicationDetail, PublicationSummary } from "@app/backend/contract/publications";
import { ArrowLeft, ArrowUpRight, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader, PublicFooter, useAppMeta } from "../brand.tsx";
import { formatCost, formatDate, formatLatency, truncate } from "../../lib/format.ts";
import { prettyModelId } from "../../lib/run.ts";

export const publicBase = (publicOrigin: string): string => publicOrigin || (typeof window === "undefined" ? "" : window.location.origin);

export const publicAssetUrl = (publicOrigin: string, assetPath: string): string => {
  const base = publicBase(publicOrigin);
  return base ? `${base.replace(/\/$/, "")}${assetPath}` : assetPath;
};

type FeedState = { status: "loading"; data: null; error: null } | { status: "ready"; data: FeedResponse; error: null } | { status: "error"; data: null; error: string };

const useFeed = (handle?: string) => {
  const [state, setState] = useState<FeedState>({ status: "loading", data: null, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", data: null, error: null });
    const query = handle ? `?handle=${encodeURIComponent(handle)}` : "";
    void fetch(`/api/public/feed${query}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`The catalog answered ${response.status}.`);
        return (await response.json()) as FeedResponse;
      })
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", data: null, error: error instanceof Error ? error.message : "Could not load the catalog." });
      });
    return () => {
      cancelled = true;
    };
  }, [handle, nonce]);

  return { ...state, reload: () => setNonce((value) => value + 1) };
};

type PublicationState =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: PublicationDetail; error: null }
  | { status: "missing"; data: null; error: null }
  | { status: "error"; data: null; error: string };

const usePublication = (id: string) => {
  const [state, setState] = useState<PublicationState>({ status: "loading", data: null, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", data: null, error: null });
    void fetch(`/api/public/publications/${encodeURIComponent(id)}`)
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`The catalog answered ${response.status}.`);
        return (await response.json()) as PublicationDetail;
      })
      .then((data) => {
        if (cancelled) return;
        if (!data) setState({ status: "missing", data: null, error: null });
        else setState({ status: "ready", data, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", data: null, error: error instanceof Error ? error.message : "Could not load this publication." });
      });
    return () => {
      cancelled = true;
    };
  }, [id, nonce]);

  return { ...state, reload: () => setNonce((value) => value + 1) };
};

function CatalogLoading() {
  return (
    <div className="public-grid">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="public-card" key={index}>
          <div className="skeleton aspect-square" />
          <div className="public-body">
            <div className="skeleton h-6 w-4/5" />
            <div className="skeleton mt-2 h-3 w-2/5" />
            <div className="skeleton mt-3 h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CatalogError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="py-20 text-center">
      <p className="display text-4xl">The catalog is out of reach.</p>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">{message}</p>
      <button type="button" className="btn btn-small mt-5" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

function PublicCard({ publication, base }: { publication: PublicationSummary; base: string }) {
  const runUrl = `${base}/p/${publication.id}`;
  const cover = publication.coverAssetPath ? publicAssetUrl(base, publication.coverAssetPath) : null;
  return (
    <article className="public-card">
      <a className="block" href={runUrl}>
        <div className="public-cover">
          {cover ? (
            <img src={cover} alt="" loading="lazy" />
          ) : (
            <div className="grid h-full place-items-center font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">No cover</div>
          )}
          <span className="card-badge">{publication.medium === "svg" ? "SVG" : "Image"}</span>
          <span className="card-count">{publication.artifactCount} outputs</span>
        </div>
      </a>
      <div className="public-body">
        <a href={runUrl}>
          <h2 className="public-title-card">{publication.title}</h2>
        </a>
        <div className="public-byline">
          <a href={`${base}/u/${publication.handle}`}>@{publication.handle}</a>
          <span>·</span>
          <span>{formatDate(publication.createdAt)}</span>
          <span>·</span>
          <span>{publication.mode}</span>
        </div>
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--muted)]">{truncate(publication.brief, 180)}</p>
        <div className="public-models">
          {publication.models.slice(0, 3).map((model) => (
            <span className="chip" key={model}>
              {prettyModelId(model)}
            </span>
          ))}
          {publication.models.length > 3 ? <span className="chip">+{publication.models.length - 3}</span> : null}
          {publication.tags.slice(0, 2).map((tag) => (
            <span className="chip chip-accent" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

function CatalogView({ state, base, appOrigin }: { state: ReturnType<typeof useFeed>; base: string; appOrigin: string }) {
  if (state.status === "loading") return <CatalogLoading />;
  if (state.status === "error") return <CatalogError message={state.error} onRetry={state.reload} />;
  if (!state.data || state.data.publications.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="display text-4xl">The catalog is still empty.</p>
        <p className="mx-auto mt-3 max-w-[44ch] text-sm leading-relaxed text-[var(--muted)]">
          Publish a run from the studio and it lands here with its prompt, model, seed, cost, and latency attached.
        </p>
        {appOrigin ? (
          <a className="btn btn-accent mt-5" href={appOrigin}>
            Open the studio <ArrowUpRight size={12} />
          </a>
        ) : null}
      </div>
    );
  }
  return (
    <div className="public-grid">
      {state.data.publications.map((publication) => (
        <PublicCard key={publication.id} publication={publication} base={base} />
      ))}
    </div>
  );
}

export function PublicCatalogPage({ mode = "catalog" }: { mode?: "catalog" | "explore" }) {
  const meta = useAppMeta();
  const state = useFeed();
  const base = publicBase(meta.publicOrigin);
  const catalogHref = meta.publicMode ? "/" : "/explore";
  const publicationCount = state.data?.publications.length;
  const modelCount = useMemo(() => {
    const models = new Set<string>();
    for (const publication of state.data?.publications ?? []) for (const model of publication.models) models.add(model);
    return models.size;
  }, [state.data]);

  return (
    <div className="public-shell">
      <SiteHeader appName={meta.appName} active={mode === "catalog" ? "catalog" : "explore"} publicMode={meta.publicMode} appOrigin={meta.appOrigin} />
      <header className="public-hero">
        <div className="public-hero-inner">
          <div>
            <span className="eyebrow">{mode === "catalog" ? "The public catalog" : "Published runs"}</span>
            <h1 className="public-title">
              One brief.
              <br />
              Every model
              <br />
              on the record.
            </h1>
            <p className="public-lede">
              A catalog of finished comparisons. Every output keeps the prompt that produced it, the model that rendered it, the seed, the cost, and the time it took.
              Nothing is flattened into a feed.
            </p>
          </div>
          <aside className="public-aside">
            <span className="block">
              <strong>{publicationCount ?? "—"}</strong> {publicationCount === 1 ? "published run" : "published runs"}
            </span>
            <span className="block">
              <strong>{modelCount || "—"}</strong> {modelCount === 1 ? "model" : "models"} on record
            </span>
            <span className="mt-4 block normal-case tracking-normal text-[var(--muted)]">Local-first. Public by choice. The studio never uploads your key.</span>
          </aside>
        </div>
      </header>
      <main className="public-main">
        <CatalogView state={state} base={base} appOrigin={meta.appOrigin} />
      </main>
      <PublicFooter catalogHref={catalogHref} appOrigin={meta.appOrigin} />
    </div>
  );
}

export function PublicProfilePage({ handle }: { handle: string }) {
  const meta = useAppMeta();
  const state = useFeed(handle);
  const base = publicBase(meta.publicOrigin);
  const catalogHref = meta.publicMode ? "/" : "/explore";
  const first = state.data?.publications[0];
  const runCount = state.data?.publications.length ?? 0;

  return (
    <div className="public-shell">
      <SiteHeader appName={meta.appName} active="profile" publicMode={meta.publicMode} appOrigin={meta.appOrigin} />
      <header className="public-hero">
        <div className="public-hero-inner">
          <div>
            <span className="eyebrow">Creator</span>
            <h1 className="public-title">@{handle}</h1>
            <p className="public-lede">
              {first ? `${first.displayName} has published ${runCount} ${runCount === 1 ? "run" : "runs"}.` : "A creator on models are jagged."}
            </p>
          </div>
          <aside className="public-aside">
            <span className="block">
              <strong>{state.data?.publications.length ?? "—"}</strong> published {runCount === 1 ? "run" : "runs"}
            </span>
            <a className="mt-4 inline-flex items-center gap-1 text-[var(--ink)] underline" href={catalogHref}>
              The full catalog <ArrowUpRight size={11} />
            </a>
          </aside>
        </div>
      </header>
      <main className="public-main">
        {state.status === "loading" ? (
          <CatalogLoading />
        ) : state.status === "error" ? (
          <CatalogError message={state.error} onRetry={state.reload} />
        ) : !state.data || state.data.publications.length === 0 ? (
          <div className="py-24 text-center">
            <p className="display text-4xl">Nothing published under @{handle} yet.</p>
            <a className="btn btn-small mt-5" href={catalogHref}>
              Back to the catalog
            </a>
          </div>
        ) : (
          <div className="public-grid">
            {state.data.publications.map((publication) => (
              <PublicCard key={publication.id} publication={publication} base={base} />
            ))}
          </div>
        )}
      </main>
      <PublicFooter catalogHref={catalogHref} appOrigin={meta.appOrigin} />
    </div>
  );
}

export function PublicRunPage({ id }: { id: string }) {
  const meta = useAppMeta();
  const state = usePublication(id);
  const base = publicBase(meta.publicOrigin);
  const catalogHref = meta.publicMode ? "/" : "/explore";

  if (state.status === "loading") {
    return (
      <div className="public-shell">
        <SiteHeader appName={meta.appName} active={meta.publicMode ? "catalog" : "explore"} publicMode={meta.publicMode} appOrigin={meta.appOrigin} />
        <main className="public-run">
          <div className="skeleton h-4 w-40" />
          <div className="skeleton mt-5 h-20 w-3/4" />
          <div className="public-artifact-grid">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="public-artifact" key={index}>
                <div className="skeleton aspect-square" />
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (state.status === "missing") {
    return (
      <div className="public-shell">
        <SiteHeader appName={meta.appName} active={meta.publicMode ? "catalog" : "explore"} publicMode={meta.publicMode} appOrigin={meta.appOrigin} />
        <div className="mx-auto max-w-xl px-6 py-28 text-center">
          <span className="eyebrow">404 / unpublished</span>
          <h1 className="display mt-3 text-5xl leading-[0.9]">This publication is gone.</h1>
          <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
            The creator unpublished it, or the link was never real. The catalog still has everything else.
          </p>
          <a className="btn btn-accent mt-6" href={catalogHref}>
            <ArrowLeft size={12} /> Back to the catalog
          </a>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="public-shell">
        <SiteHeader appName={meta.appName} active={meta.publicMode ? "catalog" : "explore"} publicMode={meta.publicMode} appOrigin={meta.appOrigin} />
        <div className="mx-auto max-w-xl px-6 py-28 text-center">
          <p className="display text-4xl">The publication could not load.</p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">{state.error}</p>
          <button type="button" className="btn btn-small mt-5" onClick={state.reload}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const publication = state.data;
  if (!publication) return null;

  return (
    <div className="public-shell">
      <SiteHeader appName={meta.appName} active={meta.publicMode ? "catalog" : "explore"} publicMode={meta.publicMode} appOrigin={meta.appOrigin} />
      <main className="public-run">
        <a className="eyebrow inline-flex items-center gap-1 hover:text-[var(--orange)]" href={catalogHref}>
          <ArrowLeft size={11} /> The catalog
        </a>
        <div className="public-run-head">
          <div>
            <span className="eyebrow">Published {formatDate(publication.createdAt)}</span>
            <h1 className="public-run-title">{publication.title}</h1>
            <p className="public-run-brief">{publication.brief}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="chip chip-orange">{publication.medium === "svg" ? "SVG" : "Image"}</span>
              <span className="chip">{publication.mode}</span>
              <span className="chip">{publication.artifactCount} outputs</span>
              {publication.tags.map((tag) => (
                <span className="chip" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <aside className="public-run-meta">
            <span className="eyebrow">Creator</span>
            <a className="display text-3xl leading-none hover:text-[var(--orange)]" href={`${base}/u/${publication.handle}`}>
              @{publication.handle}
            </a>
            <span className="font-mono text-[9px] uppercase leading-relaxed tracking-[0.08em] text-[var(--muted)]">{publication.displayName}</span>
            <span className="mt-3 block font-mono text-[9px] uppercase leading-relaxed tracking-[0.08em] text-[var(--muted)]">
              {publication.models.map((model) => (
                <span className="block" key={model}>
                  {model}
                </span>
              ))}
            </span>
          </aside>
        </div>

        <div className="public-artifact-grid">
          {publication.artifacts.map((artifact) => {
            const url = publicAssetUrl(base, artifact.assetPath);
            return (
              <article className="public-artifact" key={artifact.id}>
                <div className="public-artifact-media">
                  <a href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt={`${prettyModelId(artifact.modelId)} output`} loading="lazy" />
                  </a>
                </div>
                <div className="public-artifact-body">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-mono text-[12px] font-semibold leading-tight">{prettyModelId(artifact.modelId)}</h2>
                      <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--muted)]">
                        {artifact.promptSource} · seed {artifact.seed ?? "—"}
                      </p>
                    </div>
                    <a className="text-[var(--muted)] hover:text-[var(--orange)]" href={url} target="_blank" rel="noreferrer" aria-label="Open the original file">
                      <ExternalLink size={13} />
                    </a>
                  </div>
                  <p className="public-artifact-prompt">{artifact.prompt}</p>
                  <div className="public-detail-stats">
                    <span className="chip">{formatCost(artifact.costUsd)}</span>
                    <span className="chip">{formatLatency(artifact.latencyMs)}</span>
                    <span className="chip">{artifact.width && artifact.height ? `${artifact.width}×${artifact.height}` : "vector"}</span>
                    <span className="chip">{artifact.mime === "image/svg+xml" ? "SVG" : artifact.mime.replace("image/", "")}</span>
                  </div>
                  <p className="mt-2 font-mono text-[8px] text-[var(--muted)]">{artifact.modelId}</p>
                </div>
              </article>
            );
          })}
        </div>
      </main>
      <PublicFooter catalogHref={catalogHref} appOrigin={meta.appOrigin} />
    </div>
  );
}
