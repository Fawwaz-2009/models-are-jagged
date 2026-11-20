import { ArrowUpRight, Check, Copy, GitCompareArrows, RotateCcw, Square, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { formatCost, formatDate, formatLatency, truncate } from "../../lib/format.ts";
import { findCreation, studio } from "../../lib/store.ts";
import type { StudioState } from "../../lib/store.ts";
import type { AssetRecord, CreationRecord, TrialRecord } from "../../lib/types.ts";

const copyText = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text);
    studio.toast(`${label} copied.`, "success");
  } catch {
    studio.toast("Could not copy to the clipboard.", "error");
  }
};

export function DetailSheet({ state, onRerun }: { state: StudioState; onRerun: (creation: CreationRecord) => void }) {
  const creation = findCreation(state, state.detailId);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);

  useEffect(() => {
    if (!creation) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [creation]);

  if (!creation) return null;

  const running =
    Boolean(state.running[creation.id]) || creation.trials.some((trial) => trial.status === "composing" || trial.status === "rendering" || trial.status === "queued");
  const done = creation.trials.filter((trial) => trial.status === "done");
  const failed = creation.trials.filter((trial) => trial.status === "error").length;
  const renderCost = done.reduce((total, trial) => total + (trial.costUsd ?? 0), 0);
  const reference = creation.referenceAssetId ? state.assets[creation.referenceAssetId] : undefined;
  const lightboxTrial = creation.trials.find((trial) => trial.id === lightboxId) ?? null;

  const unpublish = async () => {
    if (!confirmUnpublish) {
      setConfirmUnpublish(true);
      return;
    }
    try {
      await studio.unpublishCreation(creation.id);
      studio.toast("The public snapshot is gone. The local run stays.", "success");
    } catch (error) {
      studio.toast(error instanceof Error ? error.message : "Could not unpublish.", "error");
    } finally {
      setConfirmUnpublish(false);
    }
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={studio.closeDetail} aria-hidden="true" />
      <section className="detail-sheet" role="dialog" aria-modal="true" aria-label="Run detail">
        <header className="sheet-head">
          <div className="min-w-0">
            <span className="eyebrow">
              Run / {formatDate(creation.createdAt)} / {creation.mode}
            </span>
            <h2 className="sheet-title">{creation.brief}</h2>
            <div className="sheet-meta">
              <span className="chip chip-orange">{creation.medium === "svg" ? "SVG" : "Image"}</span>
              <span className="chip">{creation.trials.length} trials</span>
              <span className="chip">{creation.rendererIds.length} renderers</span>
              {creation.mode === "compose" ? <span className="chip">{creation.promptLlmIds.length} prompt models</span> : null}
              <span className="chip">seed {creation.baseSeed}</span>
              {creation.published ? <span className="chip chip-accent">published</span> : null}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={studio.closeDetail} aria-label="Close run detail">
            <X size={16} />
          </button>
        </header>

        <div className="sheet-scroll">
          <div className="sheet-actions">
            <button type="button" className="btn btn-small" onClick={studio.openCompare} disabled={state.selected.length < 2}>
              <GitCompareArrows size={13} /> Compare {state.selected.length > 0 ? `(${state.selected.length})` : ""}
            </button>
            <button type="button" className="btn btn-small btn-accent" onClick={() => studio.openPublish(creation.id)} disabled={done.length === 0}>
              {creation.published ? "Update publication" : "Publish"}
            </button>
            {creation.published ? (
              <>
                <a className="btn btn-small" href={creation.published.url} target="_blank" rel="noreferrer">
                  Public link <ArrowUpRight size={12} />
                </a>
                <button type="button" className="btn btn-small" onClick={() => void unpublish()} disabled={running}>
                  {confirmUnpublish ? "Confirm unpublish" : "Unpublish"}
                </button>
              </>
            ) : null}
            <button type="button" className="btn btn-small" onClick={() => onRerun(creation)}>
              <RotateCcw size={12} /> Rerun setup
            </button>
            {running ? (
              <button type="button" className="btn btn-small" onClick={() => studio.cancelRun(creation.id)}>
                <Square size={10} /> Stop
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-small danger"
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                studio.deleteCreation(creation.id);
                setConfirmDelete(false);
              }}
              onBlur={() => setConfirmDelete(false)}
            >
              <Trash2 size={12} /> {confirmDelete ? "Really delete" : "Delete local"}
            </button>
          </div>

          <div className="sheet-stats">
            <div className="sheet-stat">
              <span className="eyebrow">Prompt cost</span>
              <strong>{creation.promptCostUsd > 0 ? formatCost(creation.promptCostUsd) : "—"}</strong>
            </div>
            <div className="sheet-stat">
              <span className="eyebrow">Render cost</span>
              <strong>{renderCost > 0 ? formatCost(renderCost) : "—"}</strong>
            </div>
            <div className="sheet-stat">
              <span className="eyebrow">Outputs</span>
              <strong>
                {done.length}/{creation.trials.length}
              </strong>
            </div>
            <div className="sheet-stat">
              <span className="eyebrow">Failures</span>
              <strong>{failed}</strong>
            </div>
            <div className="sheet-stat">
              <span className="eyebrow">Frame</span>
              <strong>{creation.aspectRatio}</strong>
            </div>
            <div className="sheet-stat">
              <span className="eyebrow">Trials / model</span>
              <strong>{creation.variants}</strong>
            </div>
          </div>

          {reference ? (
            <div className="reference-row">
              <img src={state.assetUrls[reference.id]} alt="Reference for this run" />
              <div>
                <span className="eyebrow">Reference image</span>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                  {reference.width && reference.height ? `${reference.width}×${reference.height} · ` : ""}
                  {truncate(reference.mime, 40)} · passed to models that accept image input.
                </p>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-between gap-3">
            <span className="eyebrow">Every trial</span>
            <span className="eyebrow">Select up to 4 to compare</span>
          </div>

          <div className="trial-grid">
            {creation.trials.map((trial) => (
              <TrialCard
                key={trial.id}
                trial={trial}
                assetUrl={trial.assetId ? state.assetUrls[trial.assetId] : undefined}
                selected={state.selected.includes(trial.id)}
                onSelect={() => studio.toggleSelected(trial.id)}
                onOpen={() => setLightboxId(trial.id)}
              />
            ))}
          </div>

          <p className="mt-8 max-w-[70ch] font-mono text-[9px] leading-relaxed text-[var(--muted)]">
            Deleting a local run removes its outputs from this browser. A published snapshot is independent until you unpublish it. The public catalog never receives your
            OpenRouter key.
          </p>
        </div>
      </section>

      {lightboxTrial ? (
        <TrialLightbox
          creation={creation}
          trial={lightboxTrial}
          asset={lightboxTrial.assetId ? state.assets[lightboxTrial.assetId] : undefined}
          assetUrl={lightboxTrial.assetId ? state.assetUrls[lightboxTrial.assetId] : undefined}
          selected={state.selected.includes(lightboxTrial.id)}
          onToggle={() => studio.toggleSelected(lightboxTrial.id)}
          onClose={() => setLightboxId(null)}
        />
      ) : null}
    </>
  );
}

function TrialCard({
  trial,
  assetUrl,
  selected,
  onSelect,
  onOpen,
}: {
  trial: TrialRecord;
  assetUrl?: string;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const busy = trial.status === "composing" || trial.status === "rendering" || trial.status === "queued";
  return (
    <article className="trial-card" data-selected={selected}>
      <div className="trial-media">
        {assetUrl ? (
          <button type="button" className="trial-open" onClick={onOpen} aria-label={`Open ${trial.modelName} output`}>
            <img src={assetUrl} alt={`${trial.modelName} output for ${truncate(trial.prompt || trial.promptSource, 80)}`} loading="lazy" />
          </button>
        ) : null}
        {busy ? (
          <div className="trial-status">
            <div>
              <div className="spinner" />
              <span className="status-label">{trial.status === "composing" ? "Composing prompt" : trial.status === "rendering" ? "Rendering" : "Queued"}</span>
            </div>
          </div>
        ) : null}
        {trial.status === "error" ? (
          <div className="trial-status" data-tone="error">
            <div>
              <span className="status-label text-[var(--orange)]">Failed</span>
              <p className="status-error">{trial.error ?? "The model did not return an output."}</p>
            </div>
          </div>
        ) : null}
        {trial.status === "cancelled" ? (
          <div className="trial-status">
            <span className="status-label text-[var(--muted)]">Cancelled</span>
          </div>
        ) : null}
        {trial.status === "done" && !assetUrl ? (
          <div className="trial-status" data-tone="error">
            <span className="status-label">File missing</span>
          </div>
        ) : null}
        {trial.status === "done" ? (
          <button
            type="button"
            className="trial-select"
            data-selected={selected}
            onClick={onSelect}
            aria-pressed={selected}
            aria-label={selected ? "Remove from comparison" : "Add to comparison"}
            title={selected ? "Remove from comparison" : "Add to comparison"}
          >
            {selected ? <Check size={12} /> : "+"}
          </button>
        ) : null}
      </div>
      <div className="trial-body">
        <div className="trial-model">{trial.modelName}</div>
        <div className="trial-source">
          {trial.promptSource} · {trial.medium === "svg" ? "SVG" : "image"}
        </div>
        <p className="trial-prompt">{trial.prompt || "Waiting for the prompt composer…"}</p>
        <div className="trial-foot">
          <span>seed {trial.seed ?? "—"}</span>
          <span>·</span>
          <span>{formatCost(trial.costUsd)}</span>
          <span>·</span>
          <span>{formatLatency(trial.latencyMs)}</span>
        </div>
      </div>
    </article>
  );
}

function TrialLightbox({
  creation,
  trial,
  asset,
  assetUrl,
  selected,
  onToggle,
  onClose,
}: {
  creation: CreationRecord;
  trial: TrialRecord;
  asset?: AssetRecord;
  assetUrl?: string;
  selected: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${trial.modelName} output`}>
      <button type="button" className="icon-btn lightbox-close" onClick={onClose} aria-label="Close output">
        <X size={16} />
      </button>
      <div className="lightbox-media">{assetUrl ? <img src={assetUrl} alt={`${trial.modelName} output`} /> : <span className="eyebrow">No file</span>}</div>
      <aside className="lightbox-meta">
        <span className="eyebrow">Output / {trial.medium === "svg" ? "vector" : "raster"}</span>
        <h2>{trial.modelName}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="chip">{trial.promptSource}</span>
          <span className="chip">seed {trial.seed ?? "—"}</span>
          <span className="chip">{formatCost(trial.costUsd)}</span>
          <span className="chip">{formatLatency(trial.latencyMs)}</span>
        </div>

        <div className="lightbox-block">
          <span className="eyebrow">Prompt</span>
          <p className="lightbox-prompt">{trial.prompt || "No prompt recorded."}</p>
        </div>

        <div className="lightbox-block">
          <span className="eyebrow">Provenance</span>
          <div className="lightbox-kv">
            <div>
              <span className="eyebrow !text-[rgba(246,241,228,0.42)]">Prompt source</span>
              <strong>{trial.llmName ?? "You"}</strong>
            </div>
            <div>
              <span className="eyebrow !text-[rgba(246,241,228,0.42)]">Renderer</span>
              <strong>{trial.modelId}</strong>
            </div>
            <div>
              <span className="eyebrow !text-[rgba(246,241,228,0.42)]">Media</span>
              <strong>{asset?.mime ?? "—"}</strong>
            </div>
            <div>
              <span className="eyebrow !text-[rgba(246,241,228,0.42)]">Pixels</span>
              <strong>{asset?.width && asset.height ? `${asset.width}×${asset.height}` : "vector / unknown"}</strong>
            </div>
            <div>
              <span className="eyebrow !text-[rgba(246,241,228,0.42)]">Run</span>
              <strong>{truncate(creation.brief, 42)}</strong>
            </div>
            <div>
              <span className="eyebrow !text-[rgba(246,241,228,0.42)]">Created</span>
              <strong>{formatDate(creation.createdAt)}</strong>
            </div>
          </div>
        </div>

        <div className="lightbox-actions">
          <button type="button" className="btn btn-small" onClick={() => void copyText(trial.prompt, "Prompt")}>
            <Copy size={12} /> Copy prompt
          </button>
          <button type="button" className={`btn btn-small ${selected ? "btn-accent" : ""}`} onClick={onToggle}>
            <GitCompareArrows size={12} /> {selected ? "In comparison" : "Compare"}
          </button>
        </div>
      </aside>
    </div>
  );
}
