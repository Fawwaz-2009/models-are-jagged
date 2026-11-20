import { getRouteApi, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Settings2 } from "lucide-react";

const rootRoute = getRouteApi("__root__");

export const useAppMeta = () => rootRoute.useLoaderData();

export function JaggedMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      <path d="M2 18.2 6.7 7.4l4.2 8.3 4.1-12 3.8 9.7 3-5.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

export function Wordmark({ appName, sub = "a comparison studio" }: { appName: string; sub?: string }) {
  return (
    <>
      <span className="brand-mark">
        <JaggedMark />
      </span>
      <span className="min-w-0">
        <span className="brand-name">{appName}</span>
        <span className="brand-sub">{sub}</span>
      </span>
    </>
  );
}

export interface HeaderProps {
  appName: string;
  active: "gallery" | "explore" | "catalog" | "profile";
  appOrigin?: string;
  publicMode?: boolean;
  keySet?: boolean;
  onSettings?: () => void;
  actions?: ReactNode;
}

export function SiteHeader({ appName, active, appOrigin, publicMode = false, keySet = false, onSettings, actions }: HeaderProps) {
  const studioHref = publicMode ? appOrigin || "/" : "/";
  const exploreHref = publicMode ? "/" : "/explore";

  return (
    <header className="site-header">
      <a className="brand" href={publicMode ? "/" : "/"}>
        <Wordmark appName={appName} sub={publicMode ? "the public catalog" : "a comparison studio"} />
      </a>

      <nav className="header-nav" aria-label="Primary">
        {publicMode ? (
          <>
            <a className="nav-tab" data-active={active === "catalog" || active === "profile"} href="/">
              Catalog
            </a>
            {studioHref ? (
              <a className="nav-tab" href={studioHref}>
                Studio <span aria-hidden="true">↗</span>
              </a>
            ) : null}
          </>
        ) : (
          <>
            <Link className="nav-tab" data-active={active === "gallery"} to="/">
              Gallery
            </Link>
            <a className="nav-tab" data-active={active === "explore"} href={exploreHref}>
              Explore
            </a>
          </>
        )}
      </nav>

      <div className="header-actions">
        {actions}
        {!publicMode && onSettings ? (
          <>
            <span className="key-state" title={keySet ? "OpenRouter key is stored in this browser" : "No OpenRouter key yet"}>
              <span className="key-dot" data-set={keySet} />
              <span>{keySet ? "Key set" : "Key missing"}</span>
            </span>
            <button type="button" className="icon-btn" onClick={onSettings} aria-label="Open settings" title="Settings">
              <Settings2 size={15} />
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}

export function PublicFooter({ catalogHref, appOrigin }: { catalogHref: string; appOrigin: string }) {
  return (
    <footer className="border-t border-[var(--line)] px-6 py-8">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-4">
        <span className="eyebrow">Models are jagged · every output carries its provenance</span>
        <div className="flex flex-wrap items-center gap-4 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">
          <a className="hover:text-[var(--orange)]" href={catalogHref}>
            Catalog
          </a>
          {appOrigin ? (
            <a className="hover:text-[var(--orange)]" href={appOrigin}>
              Open studio
            </a>
          ) : null}
          <a className="hover:text-[var(--orange)]" href="https://openrouter.ai" target="_blank" rel="noreferrer">
            OpenRouter
          </a>
        </div>
      </div>
    </footer>
  );
}
