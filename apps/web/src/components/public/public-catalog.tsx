import type { FeedResponse, PublicationDetail, PublicationSummary } from "@app/backend/contract/publications";
import { ArrowUpRight, Copy, ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AppShell, useAppMeta } from "../brand.tsx";
import { AssetGrid, AssetTile } from "../asset-tile.tsx";
import { formatDate, truncate } from "../../lib/format.ts";
import { prettyModelId } from "../../lib/run.ts";
import { studio } from "../../lib/store.ts";
import { Modal } from "../modal.tsx";

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
    <AssetGrid>
      {Array.from({ length: 12 }, (_, index) => (
        <div className="asset-tile" key={index}>
          <div className="asset-tile-loading" />
        </div>
      ))}
    </AssetGrid>
  );
}

function CatalogMessage({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="catalog-message">
      <span className="empty-mark">J</span>
      <h2 className="empty-title">{title}</h2>
      {text ? <p className="empty-text">{text}</p> : null}
      {action ? <div className="catalog-message-action">{action}</div> : null}
    </div>
  );
}

function PublicationTile({ publication, base, onOpen }: { publication: PublicationSummary; base: string; onOpen: () => void }) {
  const cover = publication.coverAssetPath ? publicAssetUrl(base, publication.coverAssetPath) : null;
  return (
    <AssetTile
      imageUrl={cover}
      alt={truncate(publication.title, 100)}
      title={publication.title}
      meta={`@${publication.handle} · ${formatDate(publication.createdAt)} · ${publication.artifactCount} outputs`}
      onOpen={onOpen}
    />
  );
}

/**
 * The catalog grid, with no page furniture. It is the same component in the
 * studio's Explore tab and on the public catalog. Cards open a dialog over
 * the grid instead of navigating to a different layout.
 */
export function CatalogSurface({
  appOrigin = "",
  publicOrigin = "",
  handle,
  initialPublicationId,
}: {
  appOrigin?: string;
  publicOrigin?: string;
  handle?: string;
  initialPublicationId?: string;
}) {
  const feed = useFeed(handle);
  const [openId, setOpenId] = useState<string | null>(initialPublicationId ?? null);
  const base = publicBase(publicOrigin);

  useEffect(() => {
    if (initialPublicationId) setOpenId(initialPublicationId);
  }, [initialPublicationId]);

  let content;
  if (feed.status === "loading") {
    content = <CatalogLoading />;
  } else if (feed.status === "error") {
    content = (
      <CatalogMessage
        title="The catalog is out of reach."
        text={feed.error}
        action={
          <button type="button" className="btn btn-secondary btn-sm" onClick={feed.reload}>
            Try again
          </button>
        }
      />
    );
  } else if (feed.data.publications.length === 0) {
    content = (
      <CatalogMessage
        title={handle ? `Nothing under @${handle} yet.` : "Nothing published yet."}
        text="Publish a run from the studio and it appears here."
        action={
          appOrigin ? (
            <a className="btn btn-primary btn-sm" href={appOrigin}>
              Open the studio <ArrowUpRight size={12} />
            </a>
          ) : null
        }
      />
    );
  } else {
    content = (
      <AssetGrid>
        {feed.data.publications.map((publication) => (
          <PublicationTile key={publication.id} publication={publication} base={base} onOpen={() => setOpenId(publication.id)} />
        ))}
      </AssetGrid>
    );
  }

  return (
    <>
      {content}
      {openId ? <PublicationDialog id={openId} base={base} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}

function PublicationDialog({ id, base, onClose }: { id: string; base: string; onClose: () => void }) {
  const publication = usePublication(id);
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setIndex(0);
  }, [id]);

  const data = publication.status === "ready" ? publication.data : null;
  const artifact = data?.artifacts[index];

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(`${base}/p/${data.id}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      studio.toast("Could not copy the link.", "error");
    }
  };

  return (
    <Modal open onClose={onClose} label="Publication" size="xl" className="viewer-modal">
      {publication.status === "loading" ? (
        <div className="public-dialog-loading">
          <div className="skeleton aspect-square" />
          <div className="public-dialog-loading-copy">
            <div className="skeleton h-5 w-2/3" />
            <div className="skeleton mt-3 h-3 w-1/3" />
            <div className="skeleton mt-8 h-24 w-full" />
          </div>
        </div>
      ) : publication.status === "missing" ? (
        <div className="catalog-message">
          <h2 className="empty-title">This publication is gone.</h2>
          <p className="empty-text">The creator unpublished it, or the link was never real.</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Back to the gallery
          </button>
        </div>
      ) : publication.status === "error" ? (
        <div className="catalog-message">
          <h2 className="empty-title">Could not load this run.</h2>
          <p className="empty-text">{publication.error}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={publication.reload}>
            Try again
          </button>
        </div>
      ) : data && artifact ? (
        <div className="viewer">
          <div className="viewer-stage">
            <button type="button" className="viewer-close" onClick={onClose} aria-label="Close publication">
              <X size={16} />
            </button>
            <a href={publicAssetUrl(base, artifact.assetPath)} target="_blank" rel="noreferrer" className="viewer-image-link">
              <img src={publicAssetUrl(base, artifact.assetPath)} alt={truncate(artifact.prompt, 120)} className="viewer-image" />
            </a>
            <span className="viewer-count">
              {index + 1} / {data.artifacts.length}
            </span>
          </div>

          <aside className="viewer-panel">
            <div className="viewer-head">
              <span className="viewer-kicker">
                @{data.handle} · {formatDate(data.createdAt)}
              </span>
              <h2 className="viewer-title">{data.title}</h2>
              <div className="viewer-meta">
                <span className="chip">{data.medium === "svg" ? "SVG" : "Image"}</span>
                <span className="chip">{data.mode === "compose" ? "Refined" : "As written"}</span>
                <span className="chip">{data.artifactCount} outputs</span>
                {data.tags.map((tag) => (
                  <span className="chip" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="viewer-section">
              <span className="viewer-label">Brief</span>
              <p className="viewer-prompt">{data.brief}</p>
            </div>

            <div className="viewer-section">
              <span className="viewer-label">Prompt</span>
              <p className="viewer-prompt">{artifact.prompt}</p>
              <p className="viewer-source">
                <strong>{artifact.llmId ? `Refined by ${artifact.promptSource}` : "Prompt as written"}</strong>
              </p>
            </div>

            <div className="viewer-section">
              <span className="viewer-label">Model</span>
              <p className="viewer-model">{prettyModelId(artifact.modelId)}</p>
              <p className="viewer-model-id">{artifact.modelId}</p>
              <p className="viewer-size">
                {data.medium === "svg" ? "SVG" : "Image"}
                {artifact.width && artifact.height ? ` · ${artifact.width} × ${artifact.height}` : ""}
              </p>
            </div>

            <div className="viewer-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void copy()}>
                <Copy size={12} /> {copied ? "Copied" : "Copy link"}
              </button>
              <a className="btn btn-secondary btn-sm" href={publicAssetUrl(base, artifact.assetPath)} target="_blank" rel="noreferrer">
                <ExternalLink size={12} /> Original
              </a>
            </div>
          </aside>

          {data.artifacts.length > 1 ? (
            <div className="viewer-strip" aria-label="Outputs in this run">
              {data.artifacts.map((entry, entryIndex) => (
                <button
                  type="button"
                  key={entry.id}
                  className="viewer-thumb"
                  data-active={entryIndex === index}
                  onClick={() => setIndex(entryIndex)}
                  aria-label={`View ${prettyModelId(entry.modelId)}`}
                >
                  <img src={publicAssetUrl(base, entry.assetPath)} alt="" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

export function PublicCatalogPage({ initialPublicationId }: { initialPublicationId?: string }) {
  const meta = useAppMeta();
  return (
    <AppShell active="gallery">
      <CatalogSurface appOrigin={meta.appOrigin} publicOrigin={meta.publicOrigin} initialPublicationId={initialPublicationId} />
    </AppShell>
  );
}

export function PublicProfilePage({ handle }: { handle: string }) {
  const meta = useAppMeta();
  return (
    <AppShell active="gallery">
      <CatalogSurface handle={handle} appOrigin={meta.appOrigin} publicOrigin={meta.publicOrigin} />
    </AppShell>
  );
}

export function PublicRunPage({ id }: { id: string }) {
  return <PublicCatalogPage initialPublicationId={id} />;
}
