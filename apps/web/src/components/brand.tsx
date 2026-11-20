import { getRouteApi, Link } from "@tanstack/react-router";
import { ArrowUpRight, Compass, Images, Settings2 } from "lucide-react";
import type { ReactNode } from "react";

const rootRoute = getRouteApi("__root__");

export const useAppMeta = () => rootRoute.useLoaderData();

export function JaggedMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      <path d="M2 18.2 6.7 7.4l4.2 8.3 4.1-12 3.8 9.7 3-5.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

export function Wordmark({ appName, sub = "studio" }: { appName: string; sub?: string }) {
  return (
    <>
      <span className="brand-mark">
        <JaggedMark />
      </span>
      <span className="brand-copy">
        <span className="brand-name">{appName}</span>
        <span className="brand-sub">{sub}</span>
      </span>
    </>
  );
}

interface AppShellProps {
  active: "gallery" | "explore";
  children: ReactNode;
  dock?: boolean;
  onSettings?: () => void;
  keySet?: boolean;
}

/**
 * No side rail. The page is the asset grid. Two small floating clusters keep
 * navigation and settings reachable without taking any room from the work.
 */
export function AppShell({ active, children, dock = false, onSettings, keySet = false }: AppShellProps) {
  const meta = useAppMeta();
  const app = !meta.publicMode;

  return (
    <div className="app">
      <div className="topbar">
        {app ? (
          <Link className="topbar-brand" to="/" title={meta.appName} aria-label={`${meta.appName}, gallery`}>
            <JaggedMark />
          </Link>
        ) : (
          <a className="topbar-brand" href="/" title={meta.appName} aria-label={`${meta.appName}, gallery`}>
            <JaggedMark />
          </a>
        )}

        <nav className="topbar-actions" aria-label="Primary">
          {app ? (
            <>
              <Link className="topbar-button" data-active={active === "gallery"} to="/" title="Gallery" aria-label="Gallery">
                <Images size={16} />
              </Link>
              <Link className="topbar-button" data-active={active === "explore"} to="/explore" title="Explore" aria-label="Explore">
                <Compass size={16} />
              </Link>
              {onSettings ? (
                <button type="button" className="topbar-button" onClick={onSettings} title="Settings" aria-label="Settings">
                  <Settings2 size={16} />
                  {keySet ? <span className="topbar-key" aria-hidden="true" /> : null}
                </button>
              ) : null}
            </>
          ) : (
            <>
              <a className="topbar-button" data-active="true" href="/" title="Gallery" aria-label="Gallery">
                <Images size={16} />
              </a>
              {meta.appOrigin ? (
                <a className="topbar-button" href={meta.appOrigin} title="Open the studio" aria-label="Open the studio">
                  <ArrowUpRight size={16} />
                </a>
              ) : null}
            </>
          )}
        </nav>
      </div>

      <main className={dock ? "app-main app-main-docked" : "app-main"}>{children}</main>
    </div>
  );
}
