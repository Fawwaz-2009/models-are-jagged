import { ArrowUpRight, Eye, EyeOff, LogOut, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { authClient } from "../../auth-client.ts";
import { formatDate } from "../../lib/format.ts";
import { studio, useStudio } from "../../lib/store.ts";
import { Modal } from "../modal.tsx";

export function SettingsDialog() {
  const state = useStudio();
  const [key, setKey] = useState(state.settings.apiKey);
  const [visible, setVisible] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!state.settingsOpen) return;
    setKey(state.settings.apiKey);
    setConfirmClear(false);
    void authClient
      .getSession()
      .then((response) => setSignedIn(Boolean(response.data?.user)))
      .catch(() => setSignedIn(false));
  }, [state.settingsOpen, state.settings.apiKey]);

  const save = () => {
    studio.updateSettings({ apiKey: key.trim() });
    studio.toast("Key saved in this browser.", "success");
  };

  const modelCount = state.models.text.length + state.models.image.length;
  const updated = state.models.fetchedAt ? formatDate(new Date(state.models.fetchedAt).toISOString()) : "built-in fallback";

  return (
    <Modal open={state.settingsOpen} onClose={studio.closeSettings} label="Settings" size="md" className="settings-modal">
      <div className="modal-head">
        <div>
          <h2 className="modal-title">Settings</h2>
          <p className="modal-description">Your key and files stay in this browser. Only published snapshots leave it.</p>
        </div>
      </div>

      <div className="modal-body settings-body">
        <section className="settings-section">
          <div className="settings-section-head">
            <span className="field-label">OpenRouter key</span>
            <a className="settings-link" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
              Get a key <ArrowUpRight size={11} />
            </a>
          </div>
          <div className="input-with-action">
            <input
              className="input"
              type={visible ? "text" : "password"}
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="sk-or-v1-..."
              autoComplete="off"
              spellCheck={false}
              aria-label="OpenRouter API key"
            />
            <button type="button" className="input-action" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Hide key" : "Show key"}>
              {visible ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p className="field-help">Used only for requests you start. Never sent to this app's server.</p>
          <div className="settings-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={save}>
              Save key
            </button>
            {state.settings.apiKey ? (
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  setKey("");
                  studio.updateSettings({ apiKey: "" });
                  studio.toast("Key removed from this browser.", "info");
                }}
              >
                Remove
              </button>
            ) : null}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-head">
            <span className="field-label">Models</span>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => void studio.refreshModels()} disabled={state.models.loading}>
              <RefreshCw size={11} className={state.models.loading ? "spin" : ""} /> Refresh
            </button>
          </div>
          <p className="field-help">
            {modelCount} models available. Updated {updated}.
          </p>
          {state.models.error ? <p className="field-error">{state.models.error}</p> : null}
        </section>

        <section className="settings-section">
          <div className="settings-section-head">
            <span className="field-label">Local data</span>
          </div>
          <p className="field-help">Deleting the gallery removes every local run and file from this browser. Published snapshots stay until you unpublish them.</p>
          <div className="settings-actions">
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (!confirmClear) {
                  setConfirmClear(true);
                  return;
                }
                studio.clearGallery();
                setConfirmClear(false);
                studio.toast("Local gallery cleared.", "info");
              }}
              onBlur={() => setConfirmClear(false)}
            >
              {confirmClear ? "Confirm clear gallery" : "Clear local gallery"}
            </button>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-head">
            <span className="field-label">Account</span>
          </div>
          {signedIn ? (
            <div className="settings-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  void authClient.signOut().then(() => {
                    setSignedIn(false);
                    studio.toast("Signed out.", "info");
                  });
                }}
              >
                <LogOut size={12} /> Sign out
              </button>
            </div>
          ) : (
            <div className="settings-actions">
              <a className="btn btn-secondary btn-sm" href={`/login?redirect=${encodeURIComponent("/")}`}>
                Sign in to publish
              </a>
            </div>
          )}
        </section>
      </div>

      <div className="modal-foot">
        <button type="button" className="btn btn-primary" onClick={studio.closeSettings}>
          Done
        </button>
      </div>
    </Modal>
  );
}
