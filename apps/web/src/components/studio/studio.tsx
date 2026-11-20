import { useEffect, useState } from "react";
import { authClient } from "../../auth-client.ts";
import { SiteHeader, useAppMeta } from "../brand.tsx";
import { CompareScreen } from "./compare.tsx";
import { Composer } from "./composer.tsx";
import { DetailSheet } from "./detail-sheet.tsx";
import { Gallery } from "./gallery.tsx";
import { PublishDialog } from "./publish-dialog.tsx";
import { SettingsDialog } from "./settings-dialog.tsx";
import { studio, useStudio } from "../../lib/store.ts";
import type { CreationRecord } from "../../lib/types.ts";

export function Studio({ initialPublishId }: { initialPublishId?: string }) {
  const state = useStudio();
  const meta = useAppMeta();
  const [seedBrief, setSeedBrief] = useState({ text: "", nonce: 0 });

  useEffect(() => {
    void studio.init();
  }, []);

  useEffect(() => {
    if (!initialPublishId || !state.ready) return;
    const exists = state.creations.some((creation) => creation.id === initialPublishId);
    if (exists) {
      studio.openPublish(initialPublishId);
      window.history.replaceState({}, "", "/");
    } else {
      studio.toast("That run is not in this browser. Publish from the run you can see.", "error");
    }
  }, [initialPublishId, state.ready, state.creations]);

  const suggest = (text: string) => setSeedBrief({ text, nonce: Date.now() });

  const rerun = (creation: CreationRecord) => {
    studio.updateSettings({
      mode: creation.mode,
      medium: creation.medium,
      promptModelIds: creation.promptLlmIds,
      rendererIds: creation.rendererIds,
      aspectRatio: creation.aspectRatio,
      variants: creation.variants,
    });
    setSeedBrief({ text: creation.brief, nonce: Date.now() });
    studio.closeDetail();
    studio.toast("The run's setup is in the composer.", "success");
  };

  return (
    <div className="min-h-svh">
      <SiteHeader
        appName={meta.appName}
        active="gallery"
        appOrigin={meta.appOrigin}
        keySet={state.settings.apiKey.trim().length > 0}
        onSettings={studio.openSettings}
        actions={<HeaderAccount />}
      />

      <main className="studio-main">
        {!state.ready ? (
          <div>
            <div className="studio-intro">
              <div>
                <div className="skeleton h-3 w-32" />
                <div className="skeleton mt-4 h-16 w-[min(520px,80vw)]" />
              </div>
              <div className="skeleton h-12 w-[min(320px,60vw)]" />
            </div>
            <div className="run-grid">
              {Array.from({ length: 3 }, (_, index) => (
                <div className="run-card" key={index}>
                  <div className="skeleton aspect-square" />
                  <div className="run-body">
                    <div className="skeleton h-5 w-4/5" />
                    <div className="skeleton mt-3 h-3 w-2/5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Gallery state={state} onSuggest={suggest} />
        )}
      </main>

      <Composer seedBrief={seedBrief} />
      <DetailSheet state={state} onRerun={rerun} />
      <CompareScreen state={state} />
      <SettingsDialog />
      <PublishDialog publicOrigin={meta.publicOrigin} />
      <Toaster />
    </div>
  );
}

function HeaderAccount() {
  const [user, setUser] = useState<{ email: string } | null>(null);

  useEffect(() => {
    void authClient
      .getSession()
      .then((response) => setUser(response.data?.user ? { email: response.data.user.email } : null))
      .catch(() => setUser(null));
  }, []);

  if (!user) {
    return (
      <a className="btn btn-small hidden sm:inline-flex" href={`/login?redirect=${encodeURIComponent("/")}`}>
        Sign in
      </a>
    );
  }

  return (
    <button type="button" className="btn btn-small hidden max-w-[180px] sm:inline-flex" onClick={studio.openSettings} title={user.email}>
      <span className="truncate">{user.email.split("@")[0]}</span>
    </button>
  );
}

export function Toaster() {
  const state = useStudio();
  if (state.toasts.length === 0) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {state.toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast"
          data-tone={toast.tone}
          onClick={() => studio.dismissToast(toast.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") studio.dismissToast(toast.id);
          }}
          role="button"
          tabIndex={0}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
