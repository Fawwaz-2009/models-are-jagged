import { ArrowUpRight, Check, Copy, GitCompareArrows, RotateCcw, Square, Trash2, X } from "lucide-react";
import { useState } from "react";
import { formatDate, truncate } from "../../lib/format.ts";
import { findCreation, findOutput, studio } from "../../lib/store.ts";
import type { StudioState } from "../../lib/store.ts";
import type { CreationRecord, OutputRecord } from "../../lib/types.ts";
import { Modal } from "../modal.tsx";

const copyText = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text);
    studio.toast(`${label} copied.`, "success");
  } catch {
    studio.toast("Could not copy to the clipboard.", "error");
  }
};

const statusLabel = (output: OutputRecord): string => {
  if (output.status === "queued") return "Queued";
  if (output.status === "composing") return "Writing prompt";
  if (output.status === "rendering") return "Rendering";
  if (output.status === "error") return "Failed";
  if (output.status === "cancelled") return "Stopped";
  return "Done";
};

const sourceLabel = (output: OutputRecord): string => {
  if (output.llmId) return `Refined by ${output.llmName ?? "a prompt model"}`;
  return "Prompt as written";
};

export function DetailSheet({ state, onRerun }: { state: StudioState; onRerun: (creation: CreationRecord) => void }) {
  const creation = findCreation(state, state.detailId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  if (!creation) return null;

  const output = creation.outputs.find((entry) => entry.id === state.focusOutputId) ?? creation.outputs[0];
  const asset = output?.assetId ? state.assets[output.assetId] : undefined;
  const url = output?.assetId ? state.assetUrls[output.assetId] : undefined;
  const running = creation.outputs.some((entry) => entry.status === "composing" || entry.status === "rendering" || entry.status === "queued");
  const done = creation.outputs.filter((entry) => entry.status === "done").length;
  const selected = output ? state.selected.includes(output.id) : false;

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
    <Modal open={Boolean(creation)} onClose={studio.closeDetail} label="Output viewer" size="xl" className="viewer-modal">
      {output ? (
        <div className="viewer">
          <div className="viewer-stage">
            <button type="button" className="viewer-close" onClick={studio.closeDetail} aria-label="Close viewer">
              <X size={16} />
            </button>
            {url ? (
              <a href={url} target="_blank" rel="noreferrer" className="viewer-image-link" title="Open the original file">
                <img src={url} alt={truncate(output.prompt || creation.brief, 120)} className="viewer-image" />
              </a>
            ) : (
              <div className="viewer-empty">
                {output.status === "error" ? (
                  <>
                    <span className="viewer-empty-title">This output failed.</span>
                    <p>{output.error ?? "The model did not return a file."}</p>
                  </>
                ) : (
                  <>
                    <span className="spinner" />
                    <span className="viewer-empty-title">{statusLabel(output)}</span>
                    <p>You can close this and keep working. The grid updates as outputs arrive.</p>
                  </>
                )}
              </div>
            )}
            <span className="viewer-count">
              {creation.outputs.indexOf(output) + 1} / {creation.outputs.length}
            </span>
          </div>

          <aside className="viewer-panel">
            <div className="viewer-head">
              <span className="viewer-kicker">{formatDate(creation.createdAt)}</span>
              <h2 className="viewer-title">{creation.brief}</h2>
              <div className="viewer-meta">
                <span className="chip">{creation.medium === "svg" ? "SVG" : "Image"}</span>
                <span className="chip">{creation.mode === "compose" ? "Refined" : "As written"}</span>
                <span className="chip">
                  {done}/{creation.outputs.length} outputs
                </span>
                {creation.published ? <span className="chip chip-success">Published</span> : null}
              </div>
            </div>

            <div className="viewer-section">
              <div className="viewer-section-head">
                <span className="viewer-label">Prompt</span>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => void copyText(output.prompt || creation.brief, "Prompt")}>
                  <Copy size={12} /> Copy
                </button>
              </div>
              <p className="viewer-prompt">{output.prompt || creation.brief}</p>
              <p className="viewer-source">
                <strong>{sourceLabel(output)}</strong>
              </p>
            </div>

            <div className="viewer-section">
              <span className="viewer-label">Model</span>
              <p className="viewer-model">{output.modelName}</p>
              <p className="viewer-model-id">{output.modelId}</p>
              <p className="viewer-size">
                {creation.aspectRatio}
                {asset?.width && asset.height ? ` · ${asset.width} × ${asset.height}` : ""}
                {output.status === "done" ? ` · ${asset?.mime.replace("image/", "").toUpperCase() ?? ""}` : ""}
              </p>
            </div>

            <div className="viewer-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => studio.toggleSelected(output.id)} disabled={output.status !== "done"}>
                {selected ? <Check size={12} /> : <GitCompareArrows size={12} />}
                {selected ? "In compare" : "Add to compare"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  studio.closeDetail();
                  studio.openCompare();
                }}
                disabled={state.selected.length < 2}
              >
                Compare {state.selected.length > 0 ? `(${state.selected.length})` : ""}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => studio.openPublish(creation.id)} disabled={done === 0}>
                {creation.published ? "Update publication" : "Publish"}
              </button>
              {url ? (
                <a className="btn btn-secondary btn-sm" href={url} target="_blank" rel="noreferrer">
                  <ArrowUpRight size={12} /> Original
                </a>
              ) : null}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRerun(creation)}>
                <RotateCcw size={12} /> Rerun setup
              </button>
              {running ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    if (!confirmStop) {
                      setConfirmStop(true);
                      return;
                    }
                    studio.cancelRun(creation.id);
                    setConfirmStop(false);
                  }}
                  onBlur={() => setConfirmStop(false)}
                >
                  <Square size={10} /> {confirmStop ? "Confirm stop" : "Stop"}
                </button>
              ) : null}
              {creation.published ? (
                <>
                  <a className="btn btn-secondary btn-sm" href={creation.published.url} target="_blank" rel="noreferrer">
                    Public link <ArrowUpRight size={12} />
                  </a>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => void unpublish()} onBlur={() => setConfirmUnpublish(false)}>
                    {confirmUnpublish ? "Confirm unpublish" : "Unpublish"}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="btn btn-danger btn-sm"
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
                <Trash2 size={12} /> {confirmDelete ? "Confirm delete" : "Delete run"}
              </button>
            </div>
          </aside>

          {creation.outputs.length > 1 ? (
            <div className="viewer-strip" aria-label="Outputs in this run">
              {creation.outputs.map((entry) => {
                const entryUrl = entry.assetId ? state.assetUrls[entry.assetId] : undefined;
                return (
                  <button
                    type="button"
                    key={entry.id}
                    className="viewer-thumb"
                    data-active={entry.id === output.id}
                    onClick={() => studio.setFocusOutput(entry.id)}
                    title={`${entry.modelName} · ${statusLabel(entry)}`}
                    aria-label={`View ${entry.modelName} output`}
                  >
                    {entryUrl ? <img src={entryUrl} alt="" /> : <span>{statusLabel(entry)}</span>}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

export function CompareScreen({ state }: { state: StudioState }) {
  const selected = state.selected
    .map((outputId) => findOutput(state, outputId))
    .filter((entry): entry is { creation: CreationRecord; output: OutputRecord } => entry !== null);

  return (
    <Modal open={state.compareOpen} onClose={studio.closeCompare} label="Compare outputs" size="xl" className="compare-modal">
      <div className="compare-head">
        <div>
          <span className="viewer-label">Compare</span>
          <h2 className="compare-title">{selected.length} outputs, one brief.</h2>
        </div>
        <div className="compare-head-actions">
          <button type="button" className="btn btn-quiet btn-sm" onClick={studio.clearSelected}>
            Clear
          </button>
          <button type="button" className="viewer-close viewer-close-static" onClick={studio.closeCompare} aria-label="Close comparison">
            <X size={16} />
          </button>
        </div>
      </div>
      {selected.length < 2 ? (
        <div className="compare-empty">
          <p>Pick at least two outputs. Open an output, then use Add to compare.</p>
        </div>
      ) : (
        <div className="compare-grid" data-count={selected.length}>
          {selected.map(({ creation, output }) => {
            const url = output.assetId ? state.assetUrls[output.assetId] : undefined;
            return (
              <article className="compare-cell" key={output.id}>
                <div className="compare-media">{url ? <img src={url} alt={`${output.modelName} output`} /> : <span>{statusLabel(output)}</span>}</div>
                <div className="compare-copy">
                  <h3>{output.modelName}</h3>
                  <p className="compare-meta">
                    {creation.medium === "svg" ? "SVG" : "Image"} · {sourceLabel(output)}
                  </p>
                  <p className="compare-prompt">{output.prompt || creation.brief}</p>
                  <div className="compare-actions">
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => void copyText(output.prompt || creation.brief, "Prompt")}>
                      <Copy size={11} /> Copy
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => studio.toggleSelected(output.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
