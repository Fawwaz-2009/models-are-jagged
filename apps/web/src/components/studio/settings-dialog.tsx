import { ExternalLink, Eye, EyeOff, LogOut, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { authClient } from "../../auth-client.ts";
import { formatDate } from "../../lib/format.ts";
import { studio, useStudio } from "../../lib/store.ts";

export function SettingsDialog() {
  const state = useStudio();
  const [key, setKey] = useState(state.settings.apiKey);
  const [visible, setVisible] = useState(false);
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!state.settingsOpen) return;
    setKey(state.settings.apiKey);
    setConfirmClear(false);
    document.body.style.overflow = "hidden";
    void authClient
      .getSession()
      .then((response) => setUser(response.data?.user ? { email: response.data.user.email, name: response.data.user.name ?? response.data.user.email } : null))
      .catch(() => setUser(null));
    return () => {
      document.body.style.overflow = "";
    };
  }, [state.settingsOpen, state.settings.apiKey]);

  useEffect(() => {
    if (!state.settingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") studio.closeSettings();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state.settingsOpen]);

  if (!state.settingsOpen) return null;

  const saveKey = () => {
    studio.updateSettings({ apiKey: key.trim() });
    studio.toast("OpenRouter key saved in this browser.", "success");
  };

  const signOut = async () => {
    await authClient.signOut();
    window.location.reload();
  };

  const clear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    studio.clearGallery();
    studio.toast("Local gallery cleared. Your key and settings stay.", "success");
    setConfirmClear(false);
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) studio.closeSettings();
      }}
    >
      <section className="modal" role="dialog" aria-modal="true" aria-label="Settings">
        <header className="modal-head">
          <div>
            <span className="eyebrow">Local configuration</span>
            <h2>Settings</h2>
          </div>
          <button type="button" className="icon-btn" onClick={studio.closeSettings} aria-label="Close settings">
            <X size={16} />
          </button>
        </header>

        <div className="modal-body">
          <div className="form-row">
            <label htmlFor="api-key" className="eyebrow">
              OpenRouter API key
            </label>
            <div className="key-input-row">
              <div className="relative flex-1">
                <input
                  id="api-key"
                  className="text-input pr-10"
                  type={visible ? "text" : "password"}
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  placeholder="sk-or-v1-…"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)]"
                  onClick={() => setVisible((value) => !value)}
                  aria-label={visible ? "Hide API key" : "Show API key"}
                >
                  {visible ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button type="button" className="btn btn-accent" onClick={saveKey}>
                Save
              </button>
            </div>
            <p className="form-help">
              Stored in localStorage on this origin. Sent only to openrouter.ai. Never included in a publication.{" "}
              <a className="underline" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
                Create a key <ExternalLink size={10} className="inline" />
              </a>
            </p>
          </div>

          <div className="form-row">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="eyebrow">Model list</span>
                <div className="model-counts">
                  <span className="chip">{state.models.text.length} text</span>
                  <span className="chip">{state.models.image.length} image</span>
                  {state.models.fetchedAt ? <span className="chip">updated {formatDate(new Date(state.models.fetchedAt).toISOString())}</span> : null}
                </div>
              </div>
              <button type="button" className="btn btn-small" onClick={() => void studio.refreshModels()} disabled={state.models.loading}>
                <RefreshCw size={12} className={state.models.loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
            {state.models.error ? (
              <p className="form-error">Could not refresh the live list: {state.models.error}. The built-in starter list is still selectable.</p>
            ) : null}
          </div>

          <div className="form-row">
            <span className="eyebrow">Account</span>
            <div className="account-row mt-2">
              {user ? (
                <>
                  <div className="who">
                    <strong>{user.name}</strong>
                    <br />
                    <span className="text-[var(--muted)]">{user.email}</span>
                  </div>
                  <button type="button" className="btn btn-small" onClick={() => void signOut()}>
                    <LogOut size={12} /> Sign out
                  </button>
                </>
              ) : (
                <>
                  <div className="who">Not signed in. Publishing needs an email account.</div>
                  <a className="btn btn-small" href={`/login?redirect=${encodeURIComponent("/")}`}>
                    Sign in
                  </a>
                </>
              )}
            </div>
            <p className="form-help">The account is only for publishing links and keeping ownership of what you publish. The studio works without it.</p>
          </div>

          <div className="form-row border-t border-[var(--line-soft)] pt-4">
            <span className="eyebrow">Local data</span>
            <p className="form-help">Runs, references, and outputs live in IndexedDB in this browser. There is no server copy until you publish.</p>
            <button type="button" className="btn btn-small mt-3 danger" onClick={clear} onBlur={() => setConfirmClear(false)}>
              {confirmClear ? "Confirm clear local gallery" : "Clear local gallery"}
            </button>
          </div>
        </div>

        <footer className="modal-foot">
          <span className="eyebrow mr-auto">models are jagged / local-first</span>
          <button type="button" className="btn" onClick={studio.closeSettings}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}
