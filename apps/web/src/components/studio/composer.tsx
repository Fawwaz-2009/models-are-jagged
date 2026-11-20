import { ImagePlus, SlidersHorizontal, X } from "lucide-react";
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

export function Composer({ seedBrief, onRun }: { seedBrief: { text: string; nonce: number }; onRun?: (id: string) => void }) {
  const state = useStudio();
  const { settings, models } = state;
  const [brief, setBrief] = useState("");
  const [reference, setReference] = useState<Reference | null>(null);
  const [advanced, setAdvanced] = useState(false);
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
  const callCount =
    Math.max(1, settings.mode === "compose" ? settings.promptModelIds.length : 1) * Math.max(1, settings.rendererIds.length) * Math.max(1, settings.variants);
  const runningCount = Object.values(state.running).filter(Boolean).length;
  const keySet = settings.apiKey.trim().length > 0;

  const setReferenceFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      studio.toast("A reference must be an image.", "error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      studio.toast("Reference images must be 10 MiB or smaller.", "error");
      return;
    }
    setReading(true);
    try {
      const dataUrl = await blobToDataUrl(file);
      setReference({ blob: file, dataUrl, mime: file.type || "image/png", name: file.name });
    } catch {
      studio.toast("Could not read that image.", "error");
    } finally {
      setReading(false);
    }
  };

  const handleRun = async () => {
    if (!keySet) {
      studio.openSettings();
      studio.toast("Add your OpenRouter key to run this.", "error");
      return;
    }
    if (brief.trim().length < 3) {
      studio.toast("Describe the brief first.", "error");
      textarea.current?.focus();
      return;
    }
    if (settings.rendererIds.length === 0) {
      studio.toast(settings.medium === "image" ? "Choose an image model as the renderer." : "Choose a text model as the SVG renderer.", "error");
      return;
    }
    if (settings.mode === "compose" && settings.promptModelIds.length === 0) {
      studio.toast("Choose at least one prompt model.", "error");
      return;
    }

    const baseSeed = settings.seedMode === "fixed" ? Math.max(0, Math.min(2_147_483_647, Math.floor(settings.fixedSeed))) : Math.floor(Math.random() * 2_000_000_000);
    const id = await studio.startRun({
      brief,
      mode: settings.mode,
      medium: settings.medium,
      promptLlmIds: settings.mode === "compose" ? settings.promptModelIds : [],
      rendererIds: settings.rendererIds,
      aspectRatio: settings.aspectRatio,
      variants: settings.variants,
      baseSeed,
      reference: reference ? { blob: reference.blob, dataUrl: reference.dataUrl, mime: reference.mime } : null,
    });
    if (id) {
      onRun?.(id);
      setReference(null);
    }
  };

  const setMode = (mode: "compose" | "direct") => studio.updateSettings({ mode });
  const setMedium = (medium: Medium) => studio.setMedium(medium);

  return (
    <section className="composer-dock" aria-label="Composer">
      <div className="composer-top">
        <div className="composer-mode">
          <span className="eyebrow !text-[rgba(246,241,228,0.38)]">Method</span>
          <div className="seg" role="group" aria-label="Method">
            <button
              type="button"
              data-active={settings.mode === "compose"}
              onClick={() => setMode("compose")}
              title="Language models write the prompt, then a renderer draws it."
            >
              Compose
            </button>
            <button type="button" data-active={settings.mode === "direct"} onClick={() => setMode("direct")} title="Your brief goes straight to the renderers.">
              Direct
            </button>
          </div>
          <span className="composer-hint hidden md:inline">
            {settings.mode === "compose" ? "LLMs map the brief → renderers draw it" : "your brief → every renderer, no rewrite"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {runningCount > 0 ? <span className="run-status">{runningCount} running</span> : null}
          <span className="composer-hint">
            {callCount} {callCount === 1 ? "call" : "calls"} · {keySet ? "key in browser" : "no key"}
          </span>
        </div>
      </div>

      <div className="composer-body">
        <div className="composer-prompt">
          <div className="composer-label-row">
            <label className="composer-label" htmlFor="brief">
              Brief
            </label>
            <span className="composer-label hidden sm:inline">⌘ / Ctrl + Enter to run</span>
          </div>
          <textarea
            id="brief"
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
            placeholder="A brass observatory on a basalt cliff, dawn light, one impossible window…"
            rows={2}
          />
        </div>

        <div className="composer-side">
          {reference ? (
            <div className="reference-thumb" title={reference.name}>
              <img src={reference.dataUrl} alt="Reference" />
              <button type="button" onClick={() => setReference(null)} aria-label="Remove reference">
                <X size={10} />
              </button>
            </div>
          ) : null}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void setReferenceFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <button type="button" className="reference-add" onClick={() => fileInput.current?.click()} disabled={reading}>
            <ImagePlus size={13} />
            {reading ? "Reading" : reference ? "Replace" : "Reference"}
          </button>
          <button type="button" className="run-button" onClick={() => void handleRun()} disabled={!keySet || brief.trim().length < 3}>
            Run
            <small>
              {callCount} {callCount === 1 ? "call" : "calls"}
            </small>
          </button>
        </div>
      </div>

      <div className="composer-controls">
        {settings.mode === "compose" ? (
          <div className="control-group">
            <span className="control-label">Prompt</span>
            <ModelPicker
              label="MODELS"
              models={promptModels}
              selectedIds={settings.promptModelIds}
              onToggle={studio.togglePromptModel}
              emptyLabel="Choose prompt models"
              accent
            />
          </div>
        ) : null}

        <div className="control-group">
          <span className="control-label">Renderers</span>
          <ModelPicker
            label="MODELS"
            models={rendererPool}
            selectedIds={settings.rendererIds}
            onToggle={studio.toggleRenderer}
            emptyLabel={settings.medium === "image" ? "Choose image models" : "Choose SVG models"}
          />
        </div>

        <div className="control-group">
          <span className="control-label">Medium</span>
          <div className="seg-mini" role="group" aria-label="Medium">
            <button type="button" data-active={settings.medium === "image"} onClick={() => setMedium("image")}>
              Image
            </button>
            <button type="button" data-active={settings.medium === "svg"} onClick={() => setMedium("svg")}>
              SVG
            </button>
          </div>
        </div>

        <div className="control-group">
          <span className="control-label">Frame</span>
          <select value={settings.aspectRatio} onChange={(event) => studio.updateSettings({ aspectRatio: event.target.value })} aria-label="Aspect ratio">
            {ASPECT_RATIOS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <span className="control-label">Trials</span>
          <div className="seg-mini" role="group" aria-label="Trials per model">
            {[1, 2, 3].map((count) => (
              <button key={count} type="button" data-active={settings.variants === count} onClick={() => studio.updateSettings({ variants: count })}>
                {count}×
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="composer-disclosure ml-auto" onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced}>
          <SlidersHorizontal size={11} className="mr-1 inline" />
          {advanced ? "Hide advanced" : "Advanced"}
        </button>
      </div>

      {advanced ? (
        <div className="composer-advanced">
          <div className="control-group">
            <span className="control-label">Seed</span>
            <div className="seg-mini">
              <button type="button" data-active={settings.seedMode === "random"} onClick={() => studio.updateSettings({ seedMode: "random" })}>
                Random
              </button>
              <button type="button" data-active={settings.seedMode === "fixed"} onClick={() => studio.updateSettings({ seedMode: "fixed" })}>
                Fixed
              </button>
            </div>
            {settings.seedMode === "fixed" ? (
              <input
                type="number"
                min={0}
                max={2_147_483_647}
                value={settings.fixedSeed}
                onChange={(event) => studio.updateSettings({ fixedSeed: Number(event.target.value) || 0 })}
                aria-label="Fixed seed"
                className="w-[96px]"
              />
            ) : null}
          </div>
          <span className="control-label">
            {settings.mode === "compose" ? "Each prompt model runs once; every renderer draws each prompt." : "Every renderer receives the same brief and base seed."}
          </span>
          <span className="control-label ml-auto">Cost is read from OpenRouter usage after each call.</span>
        </div>
      ) : null}
    </section>
  );
}
