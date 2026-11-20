import { AlertTriangle, Check, Expand } from "lucide-react";
import type { ReactNode } from "react";

export interface AssetTileProps {
  imageUrl?: string | null;
  alt: string;
  title: string;
  meta: string;
  selected?: boolean;
  running?: boolean;
  onOpen: () => void;
}

/**
 * The whole gallery is made of these: image first, nothing else. Title and
 * provenance exist only in the hover/focus overlay; clicking opens the viewer,
 * where every action lives.
 */
export function AssetTile({ imageUrl, alt, title, meta, selected = false, running = false, onOpen }: AssetTileProps) {
  return (
    <article className="asset-tile" data-selected={selected} data-running={running}>
      <button type="button" className="asset-tile-open" onClick={onOpen} aria-label={running ? `Open running ${title}` : `Open ${title}`}>
        {imageUrl ? (
          <img src={imageUrl} alt={alt} loading="lazy" draggable={false} />
        ) : running ? (
          <span className="asset-tile-skeleton">
            <span className="spinner" />
          </span>
        ) : (
          <span className="asset-tile-skeleton">
            <AlertTriangle size={18} />
          </span>
        )}
      </button>

      <div className="asset-tile-veil" aria-hidden="true" />

      <div className="asset-tile-overlay">
        <div className="asset-tile-copy">
          <p className="asset-tile-title">{title}</p>
          <p className="asset-tile-meta">{meta}</p>
        </div>
        <div className="asset-tile-actions">
          <button type="button" className="tile-button" onClick={onOpen} aria-label="Open" tabIndex={-1}>
            <Expand size={14} />
          </button>
        </div>
      </div>

      {selected ? (
        <span className="asset-tile-check" aria-label="Selected for comparison">
          <Check size={12} />
        </span>
      ) : null}
    </article>
  );
}

export function AssetGrid({ children }: { children: ReactNode }) {
  return <div className="asset-grid">{children}</div>;
}
