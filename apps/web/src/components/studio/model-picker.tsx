import { ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelInfo } from "../../lib/types.ts";

export function ModelPicker({
  label,
  models,
  selectedIds,
  onToggle,
  emptyLabel,
  accent = false,
}: {
  label: string;
  models: readonly ModelInfo[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  emptyLabel: string;
  accent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedModels = useMemo(() => models.filter((model) => selectedIds.includes(model.id)), [models, selectedIds]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return models;
    return models.filter((model) => model.name.toLowerCase().includes(needle) || model.id.toLowerCase().includes(needle));
  }, [models, query]);

  const buttonText = selectedModels.length === 0 ? emptyLabel : selectedModels.length === 1 ? selectedModels[0]!.name : `${selectedModels.length} selected`;

  return (
    <div className="model-picker" ref={root}>
      <button
        type="button"
        className="model-button"
        data-open={open}
        data-empty={selectedModels.length === 0}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={selectedModels.map((model) => model.name).join(", ") || emptyLabel}
      >
        {accent ? <span className="text-[var(--acid)]">{label}</span> : <span className="text-[rgba(246,241,228,0.45)]">{label}</span>}
        <span>{buttonText}</span>
        <ChevronDown size={11} className="ml-auto shrink-0 opacity-60" />
      </button>

      {open ? (
        <div className="model-picker-panel" role="dialog" aria-label={label}>
          <div className="model-picker-head">
            <Search size={13} className="shrink-0 text-[var(--muted)]" />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter models" aria-label={`Filter ${label}`} />
            <span className="mono shrink-0 text-[8px] tracking-[0.08em] text-[var(--muted)]">{selectedIds.length} PICKED</span>
          </div>
          <div className="model-picker-list">
            {filtered.length === 0 ? <p className="model-picker-empty">No models match. Try another name, or refresh the list in settings.</p> : null}
            {filtered.map((model) => {
              const checked = selectedIds.includes(model.id);
              return (
                <label className="model-picker-row" key={model.id}>
                  <input type="checkbox" checked={checked} onChange={() => onToggle(model.id)} />
                  <span className="min-w-0">
                    <span className="block truncate">{model.name}</span>
                    <span className="model-picker-id">{model.id}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-[var(--line-soft)] p-2">
            <span className="mono text-[8px] uppercase tracking-[0.1em] text-[var(--muted)]">{models.length} available</span>
            <button type="button" className="btn btn-small" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
