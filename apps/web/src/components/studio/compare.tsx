import { Copy, X } from "lucide-react";
import { useEffect } from "react";
import { formatCost, formatLatency, truncate } from "../../lib/format.ts";
import { findTrial, studio } from "../../lib/store.ts";
import type { StudioState } from "../../lib/store.ts";
import type { CSSProperties } from "react";

const copyPrompt = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    studio.toast("Prompt copied.", "success");
  } catch {
    studio.toast("Could not copy the prompt.", "error");
  }
};

export function CompareScreen({ state }: { state: StudioState }) {
  const selected = state.selected.map((trialId) => findTrial(state, trialId)).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  useEffect(() => {
    if (!state.compareOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") studio.closeCompare();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [state.compareOpen]);

  if (!state.compareOpen) return null;

  return (
    <section className="compare-screen" role="dialog" aria-modal="true" aria-label="Compare outputs">
      <header className="compare-head">
        <div>
          <span className="eyebrow">Comparison / {selected.length} outputs</span>
          <h2 className="display mt-1 text-[clamp(28px,4vw,48px)] leading-[0.9]">Side by side, receipt attached.</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-small" onClick={studio.clearSelected} disabled={selected.length === 0}>
            Clear
          </button>
          <button type="button" className="icon-btn" onClick={studio.closeCompare} aria-label="Close comparison">
            <X size={16} />
          </button>
        </div>
      </header>

      {selected.length < 2 ? (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div>
            <p className="display text-4xl">Pick at least two outputs.</p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Open a run, then use the + buttons on its trials.</p>
            <button type="button" className="btn btn-small mt-5" onClick={studio.closeCompare}>
              Back to the gallery
            </button>
          </div>
        </div>
      ) : (
        <div className="compare-grid" style={{ "--cols": Math.min(4, selected.length) } as CSSProperties}>
          {selected.map(({ creation, trial }) => {
            const asset = trial.assetId ? state.assets[trial.assetId] : undefined;
            const url = trial.assetId ? state.assetUrls[trial.assetId] : undefined;
            return (
              <article className="compare-cell" key={trial.id}>
                {url ? (
                  <img src={url} alt={`${trial.modelName} output`} />
                ) : (
                  <div className="grid aspect-square place-items-center border border-[var(--line)] bg-[var(--paper-2)] font-mono text-[10px]">No file</div>
                )}
                <h3>{trial.modelName}</h3>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  {trial.medium === "svg" ? "SVG" : "Image"} · {trial.promptSource} · seed {trial.seed ?? "—"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="chip">{formatCost(trial.costUsd)}</span>
                  <span className="chip">{formatLatency(trial.latencyMs)}</span>
                  <span className="chip">{asset?.width && asset.height ? `${asset.width}×${asset.height}` : "vector"}</span>
                </div>
                <p className="compare-prompt">{trial.prompt || "No prompt recorded."}</p>
                <p className="mt-3 font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--muted)]">From: {truncate(creation.brief, 80)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-small" onClick={() => void copyPrompt(trial.prompt)}>
                    <Copy size={11} /> Prompt
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => studio.toggleSelected(trial.id)}>
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
