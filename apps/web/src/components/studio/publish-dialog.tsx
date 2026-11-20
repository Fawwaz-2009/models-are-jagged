import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { authClient } from "../../auth-client.ts";
import { useAppMeta } from "../brand.tsx";
import { studio, useStudio } from "../../lib/store.ts";
import { truncate } from "../../lib/format.ts";
import { Modal } from "../modal.tsx";

export function PublishDialog() {
  const state = useStudio();
  const meta = useAppMeta();
  const creation = state.creations.find((entry) => entry.id === state.publishId);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!creation) return;
    setTitle(creation.brief.slice(0, 96));
    setTags("");
    setError(null);
    setSelected(creation.outputs.filter((output) => output.status === "done").map((output) => output.id));
    void authClient
      .getSession()
      .then((response) => setSignedIn(Boolean(response.data?.user)))
      .catch(() => setSignedIn(false));
  }, [creation?.id]);

  const done = useMemo(() => creation?.outputs.filter((output) => output.status === "done") ?? [], [creation]);
  if (!creation) return null;

  const publish = async () => {
    setError(null);
    if (selected.length === 0) {
      setError("Choose at least one output.");
      return;
    }
    setBusy(true);
    try {
      await studio.publishCreation(creation.id, {
        title,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 6),
        publicOrigin: meta.publicOrigin,
        outputIds: selected,
      });
      studio.toast("Published. The link is in the output viewer.", "success");
      studio.closePublish();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not publish this run.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(creation)} onClose={studio.closePublish} label="Publish run" size="lg" dismissible={!busy} className="publish-modal">
      <div className="modal-head">
        <div>
          <h2 className="modal-title">{creation.published ? "Update publication" : "Publish a snapshot"}</h2>
          <p className="modal-description">The selected outputs, prompts, and model names become a public page. Your key and local files stay here.</p>
        </div>
      </div>

      <div className="modal-body publish-body">
        <div className="field">
          <label className="field-label" htmlFor="publish-title">
            Title
          </label>
          <input id="publish-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="publish-tags">
            Tags
          </label>
          <input
            id="publish-tags"
            className="input"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="architecture, vector, type (comma separated)"
          />
        </div>

        <div className="field">
          <span className="field-label">Outputs</span>
          <div className="publish-grid">
            {done.map((output) => {
              const url = output.assetId ? state.assetUrls[output.assetId] : undefined;
              const active = selected.includes(output.id);
              return (
                <button
                  type="button"
                  key={output.id}
                  className="publish-tile"
                  data-active={active}
                  onClick={() => setSelected((current) => (current.includes(output.id) ? current.filter((id) => id !== output.id) : [...current, output.id]))}
                  aria-pressed={active}
                >
                  {url ? <img src={url} alt="" /> : <span className="publish-tile-empty">No file</span>}
                  <span className="publish-tile-check">{active ? <Check size={12} /> : null}</span>
                  <span className="publish-tile-name">{truncate(output.modelName, 30)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {signedIn === false ? (
          <div className="publish-note">
            <span>Publishing needs an account so you can delete or unpublish the snapshot later.</span>
            <a className="btn btn-secondary btn-sm" href={`/login?redirect=${encodeURIComponent(typeof window === "undefined" ? "/" : window.location.pathname)}`}>
              Sign in <ArrowUpRight size={12} />
            </a>
          </div>
        ) : null}
        {error ? <p className="field-error">{error}</p> : null}
      </div>

      <div className="modal-foot">
        <button type="button" className="btn btn-quiet" onClick={studio.closePublish} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void publish()} disabled={busy || signedIn === false}>
          {busy ? <Loader2 size={13} className="spin" /> : null}
          {busy ? "Publishing" : creation.published ? "Update" : "Publish"}
        </button>
      </div>
    </Modal>
  );
}
