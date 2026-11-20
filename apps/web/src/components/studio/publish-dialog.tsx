import { ArrowUpRight, Check, Copy, ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import { authClient } from "../../auth-client.ts";
import { findCreation, studio, useStudio } from "../../lib/store.ts";
import { truncate } from "../../lib/format.ts";

const copyUrl = async (url: string) => {
  try {
    await navigator.clipboard.writeText(url);
    studio.toast("Public link copied.", "success");
  } catch {
    studio.toast("Could not copy the link.", "error");
  }
};

export function PublishDialog({ publicOrigin }: { publicOrigin: string }) {
  const state = useStudio();
  const creation = findCreation(state, state.publishId);
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!state.publishId || !creation) return;
    setTitle(truncate(creation.brief.replace(/\s+/g, " "), 80));
    setTags("");
    setSelected(creation.trials.filter((trial) => trial.status === "done").map((trial) => trial.id));
    setError(null);
    setSuccessUrl(null);
    setSessionLoading(true);
    void authClient
      .getSession()
      .then((response) => setUser(response.data?.user ? { email: response.data.user.email, name: response.data.user.name ?? response.data.user.email } : null))
      .catch(() => setUser(null))
      .finally(() => setSessionLoading(false));
  }, [state.publishId, creation?.id]);

  useEffect(() => {
    if (!state.publishId) return;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !publishing) studio.closePublish();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [state.publishId, publishing]);

  if (!state.publishId || !creation) return null;

  const done = creation.trials.filter((trial) => trial.status === "done" && trial.assetId);
  const signInHref = `/login?redirect=${encodeURIComponent(`/?publish=${creation.id}`)}`;

  const publish = async () => {
    if (!user) {
      window.location.href = signInHref;
      return;
    }
    if (selected.length === 0) {
      setError("Pick at least one finished output.");
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const result = await studio.publishCreation(creation.id, {
        title,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 8),
        publicOrigin,
        trialIds: selected,
      });
      setSuccessUrl(result.url);
      studio.toast("Published. The snapshot is public.", "success");
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Could not publish this run.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !publishing) studio.closePublish();
      }}
    >
      <section className="modal modal-wide" role="dialog" aria-modal="true" aria-label="Publish run">
        <header className="modal-head">
          <div>
            <span className="eyebrow">{successUrl ? "Published" : creation.published ? "Update public snapshot" : "Publish a snapshot"}</span>
            <h2>{successUrl ? "The link is live." : "Send this run public."}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={studio.closePublish} aria-label="Close publish dialog" disabled={publishing}>
            <X size={16} />
          </button>
        </header>

        <div className="modal-body">
          {successUrl ? (
            <div className="publish-success">
              <p className="text-sm leading-relaxed text-[var(--muted)]">
                The catalog has a snapshot of {selected.length} {selected.length === 1 ? "output" : "outputs"}. The local run still lives in this browser and remains
                editable.
              </p>
              <div className="url">{successUrl}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-accent" onClick={() => void copyUrl(successUrl)}>
                  <Copy size={12} /> Copy link
                </button>
                <a className="btn" href={successUrl} target="_blank" rel="noreferrer">
                  Open catalog <ArrowUpRight size={12} />
                </a>
                <button type="button" className="btn" onClick={studio.closePublish}>
                  Done
                </button>
              </div>
            </div>
          ) : sessionLoading ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">Checking the session…</p>
          ) : !user ? (
            <div>
              <p className="text-sm leading-relaxed text-[var(--muted)]">
                Publishing needs an account so the link has an owner and can be taken down. The studio itself stays account-free.
              </p>
              <a className="btn btn-accent mt-4" href={signInHref}>
                Sign in with email <ArrowUpRight size={12} />
              </a>
              <p className="form-help mt-3">You will come back to this run with the publish dialog open. The local gallery is not uploaded until you confirm.</p>
            </div>
          ) : (
            <>
              <div className="form-row">
                <label htmlFor="publish-title" className="eyebrow">
                  Catalog title
                </label>
                <input id="publish-title" className="text-input" value={title} maxLength={140} onChange={(event) => setTitle(event.target.value)} />
                <p className="form-help">The brief is published as the long description, with every artifact's prompt and provenance.</p>
              </div>

              <div className="form-row">
                <label htmlFor="publish-tags" className="eyebrow">
                  Tags (comma separated)
                </label>
                <input
                  id="publish-tags"
                  className="text-input"
                  value={tags}
                  maxLength={200}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="architecture, dawn"
                />
                <p className="form-help">Up to 8. Tags are optional.</p>
              </div>

              <div className="form-row">
                <div className="flex items-center justify-between gap-3">
                  <span className="eyebrow">Outputs in this snapshot</span>
                  <button type="button" className="btn btn-small" onClick={() => setSelected(selected.length === done.length ? [] : done.map((trial) => trial.id))}>
                    {selected.length === done.length ? "Clear" : "Select all"}
                  </button>
                </div>
                <div className="publish-selection mt-2">
                  {done.map((trial) => {
                    const url = trial.assetId ? state.assetUrls[trial.assetId] : undefined;
                    const isSelected = selected.includes(trial.id);
                    return (
                      <button
                        type="button"
                        key={trial.id}
                        className="publish-choice"
                        data-selected={isSelected}
                        onClick={() => setSelected((current) => (isSelected ? current.filter((id) => id !== trial.id) : [...current, trial.id]))}
                        aria-pressed={isSelected}
                      >
                        {url ? <img src={url} alt="" /> : <div className="skeleton aspect-square" />}
                        <span>
                          {isSelected ? <Check size={9} className="mr-1 inline" /> : null}
                          {trial.modelName}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="form-help">
                  {selected.length} selected · the snapshot is capped at 16 outputs and 32 MiB. Publishing again replaces the previous snapshot for this run.
                </p>
              </div>

              <div className="border-t border-[var(--line-soft)] pt-3">
                <p className="font-mono text-[9px] leading-relaxed text-[var(--muted)]">
                  Public means public: anyone with the link can view the images, prompts, model ids, seeds, and costs. Unpublishing removes the page and its files. The
                  origin is separate from this studio.
                </p>
              </div>

              {error ? <p className="form-error">{error}</p> : null}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" className="btn btn-accent" onClick={() => void publish()} disabled={publishing || selected.length === 0}>
                  {publishing ? <span className="spinner !h-3 !w-3 !border-t-white" /> : <ArrowUpRight size={12} />}
                  {publishing ? "Publishing" : creation.published ? "Replace snapshot" : "Publish snapshot"}
                </button>
                {creation.published ? (
                  <a className="btn" href={creation.published.url} target="_blank" rel="noreferrer">
                    Current link <ExternalLink size={11} />
                  </a>
                ) : null}
                <button type="button" className="btn" onClick={studio.closePublish} disabled={publishing}>
                  Cancel
                </button>
                <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--muted)]">signed in as {user.email}</span>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
