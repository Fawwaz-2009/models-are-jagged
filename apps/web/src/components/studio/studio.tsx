import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, useAppMeta } from "../brand.tsx";
import { CatalogSurface } from "../public/public-catalog.tsx";
import { Composer } from "./composer.tsx";
import { DetailSheet, CompareScreen } from "./detail-sheet.tsx";
import { Gallery } from "./gallery.tsx";
import { PublishDialog } from "./publish-dialog.tsx";
import { SettingsDialog } from "./settings-dialog.tsx";
import { studio, useStudio } from "../../lib/store.ts";
import type { CreationRecord } from "../../lib/types.ts";

export function Studio({ view = "gallery", initialPublishId }: { view?: "gallery" | "explore"; initialPublishId?: string }) {
  const state = useStudio();
  const meta = useAppMeta();
  const navigate = useNavigate();
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
      medium: creation.medium,
      promptModelIds: creation.promptLlmIds,
      rendererIds: creation.rendererIds,
      aspectRatio: creation.aspectRatio,
    });
    setSeedBrief({ text: creation.brief, nonce: Date.now() });
    studio.closeDetail();
    studio.toast("The setup is back in the composer.", "success");
  };

  return (
    <AppShell active={view} dock keySet={state.settings.apiKey.trim().length > 0} onSettings={studio.openSettings}>
      {!state.ready ? (
        <div className="asset-grid">
          {Array.from({ length: 12 }, (_, index) => (
            <div className="asset-tile" key={index}>
              <div className="asset-tile-loading" />
            </div>
          ))}
        </div>
      ) : view === "gallery" ? (
        <Gallery state={state} onSuggest={suggest} />
      ) : (
        <CatalogSurface publicOrigin={meta.publicOrigin} />
      )}

      <Composer
        seedBrief={seedBrief}
        onStarted={() => {
          if (view === "explore") navigate({ to: "/" });
        }}
      />
      <DetailSheet state={state} onRerun={rerun} />
      <CompareScreen state={state} />
      <SettingsDialog />
      <PublishDialog />
      <Toaster />
    </AppShell>
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
