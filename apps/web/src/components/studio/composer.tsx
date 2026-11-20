import { ImagePlus, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { blobToDataUrl } from "../../lib/format.ts";
import { studio, useStudio } from "../../lib/store.ts";
import { ASPECT_RATIOS } from "../../lib/types.ts";
import type { Medium } from "../../lib/types.ts";
import { ModelPicker } from "./model-picker.tsx";

interface Reference {
  blob: Blob;
  dataUrl: string;
  mime: string;
  name: string;
}

const MAX_REFERENCES = 4;

export function Composer({ seedBrief, onStarted }: { seedBrief: { text: string; nonce: number }; onStarted?: () => void }) {
  const state = useStudio();
  const { settings, models } = state;
  const [brief, setBrief] = useState("");
  const [references, setReferences] = useState<Reference[]>([]);
  const [reading, setReading] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (seedBrief.nonce === 0) return;
    setBrief(seedBrief.text);
    textarea.current?.focus();
  }, [seedBrief]);

  const rendererPool = settings.medium === "image" ? models.image : models.text;
  const promptModels = models.text;
  const refining = settings.promptModelIds.length > 0;
  const callCount = Math.max(1, refining ? settings.promptModelIds.length : 1) * Math.max(1, settings.rendererIds.length);
  const runningCount = Object.values(state.running).filter(Boolean).length;
  const keySet = settings.apiKey.trim().length > 0;

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_REFERENCES - references.length;
    if (room <= 0) {
      studio.toast(`Up to ${MAX_REFERENCES} reference images.`, "info");
      return;
    }
    setReading(true);
    try {
      const next: Reference[] = [];
      for (const file of [...files].slice(0, room)) {
        if (!file.type.startsWith("image/")) {
          studio.toast("References must be images.", "error");
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          studio.toast("Reference images must be 10 MiB or smaller.", "error");
          continue;
        }
        const dataUrl = await blobToDataUrl(file);
        next.push({ blob: file, dataUrl, mime: file.type || "image/png", name: file.name });
      }
      if (next.length > 0) setReferences((current) => [...current, ...next]);
    } catch {
      studio.toast("Could not read one of those images.", "error");
    } finally {
      setReading(false);
    }
  };

  const handleRun = async () => {
    if (!keySet) {
      studio.openSettings();
      studio.toast("Add your OpenRouter key to generate.", "error");
      return;
    }
    if (brief.trim().length < 3) {
      studio.toast("Describe the brief first.", "error");
      textarea.current?.focus();
      return;
    }
    if (settings.rendererIds.length === 0) {
      studio.toast(settings.medium === "image" ? "Choose an image model." : "Choose an SVG model.", "error");
      return;
    }

    const id = await studio.startRun({
      brief,
      medium: settings.medium,
      promptLlmIds: refining ? settings.promptModelIds : [],
      rendererIds: settings.rendererIds,
      aspectRatio: settings.aspectRatio,
      references: references.map(({ blob, dataUrl, mime }) => ({ blob, dataUrl, mime })),
    });
    if (id) {
      setReferences([]);
      onStarted?.();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const setMedium = (medium: Medium) => studio.setMedium(medium);

  return (
    <section className="composer-shell" aria-label="Composer">
      <div className="composer-inner">
        {references.length > 0 ? (
          <div className="composer-refs" aria-label="Reference images">
            {references.map((reference, index) => (
              <div className="composer-ref" key={`${reference.name}-${index}`} title={reference.name}>
                <img src={reference.dataUrl} alt="" />
                <button type="button" onClick={() => setReferences((current) => current.filter((_, entry) => entry !== index))} aria-label={`Remove ${reference.name}`}>
                  <X size={10} />
                </button>
              </div>
            ))}
            <span className="composer-ref-note">
              {references.length}/{MAX_REFERENCES} references
            </span>
          </div>
        ) : null}

        <div className="composer-prompt-row">
          <textarea
            ref={textarea}
            className="composer-textarea"
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void handleRun();
              }
            }}
            placeholder="Describe what you want to see."
            rows={2}
            aria-label="Brief"
          />
          <div className="composer-send">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                void addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className="composer-icon-button"
              onClick={() => fileInput.current?.click()}
              disabled={reading || references.length >= MAX_REFERENCES}
              aria-label="Add a reference image"
              title="Add a reference image"
            >
              <ImagePlus size={17} />
            </button>
            <button
              type="button"
              className="btn btn-primary composer-run"
              onClick={() => void handleRun()}
              disabled={brief.trim().length < 3 || settings.rendererIds.length === 0}
            >
              Generate
              <span className="composer-run-count">{callCount}</span>
            </button>
          </div>
        </div>

        <div className="composer-controls">
          <button type="button" className="refine-toggle" data-active={refining} onClick={() => studio.setRefine(!refining)} aria-pressed={refining}>
            <Sparkles size={13} />
            Refine prompt
          </button>

          {refining ? (
            <ModelPicker
              label="Prompt models"
              models={promptModels}
              selectedIds={settings.promptModelIds}
              onToggle={studio.togglePromptModel}
              emptyLabel="Choose prompt models"
              onRefresh={() => void studio.refreshModels()}
              align="left"
            />
          ) : (
            <span className="composer-hint">Prompt goes out as written.</span>
          )}

          <span className="composer-spacer" />

          <ModelPicker
            label={settings.medium === "image" ? "Image models" : "SVG models"}
            models={rendererPool}
            selectedIds={settings.rendererIds}
            onToggle={studio.toggleRenderer}
            emptyLabel={settings.medium === "image" ? "Choose image models" : "Choose SVG models"}
            onRefresh={() => void studio.refreshModels()}
            align="right"
          />

          <div className="segmented" role="group" aria-label="Format">
            <button type="button" data-active={settings.medium === "image"} onClick={() => setMedium("image")}>
              Image
            </button>
            <button type="button" data-active={settings.medium === "svg"} onClick={() => setMedium("svg")}>
              SVG
            </button>
          </div>

          <select
            className="select composer-select"
            value={settings.aspectRatio}
            onChange={(event) => studio.updateSettings({ aspectRatio: event.target.value })}
            aria-label="Aspect ratio"
          >
            {ASPECT_RATIOS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
        </div>

        <div className="composer-foot">
          <span>{callCount === 1 ? "1 output" : `${callCount} outputs`}</span>
          <span className="dot" />
          <span>{refining ? `${settings.promptModelIds.length} prompt ${settings.promptModelIds.length === 1 ? "model" : "models"}` : "no rewrite"}</span>
          {runningCount > 0 ? (
            <>
              <span className="dot" />
              <span>{runningCount} running</span>
            </>
          ) : null}
          <span className="composer-spacer" />
          {!keySet ? (
            <button type="button" className="composer-key" onClick={studio.openSettings}>
              Add key
            </button>
          ) : null}
          <span className="composer-shortcut">⌘ Enter</span>
        </div>
      </div>
    </section>
  );
}
