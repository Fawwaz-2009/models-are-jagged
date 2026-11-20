import { ChevronDown, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelInfo } from "../../lib/types.ts";

export function ModelPicker({
  label,
  models,
  selectedIds,
  onToggle,
  emptyLabel,
  onRefresh,
  align = "left",
}: {
  label: string;
  models: readonly ModelInfo[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  emptyLabel: string;
  onRefresh?: () => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
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
    <div className="picker" ref={root} data-align={align}>
      <button
        type="button"
        className="picker-button"
        data-open={open}
        data-empty={selectedModels.length === 0}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={selectedModels.map((model) => model.name).join(", ") || emptyLabel}
      >
        <span className="picker-label">{label}</span>
        <span className="picker-value">{buttonText}</span>
        <ChevronDown size={12} className="picker-chevron" />
      </button>

      {open ? (
        <div className="picker-panel" role="dialog" aria-label={label}>
          <div className="picker-search">
            <Search size={14} />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search models" aria-label={`Search ${label}`} />
          </div>
          <div className="picker-list">
            {filtered.length === 0 ? (
              <p className="picker-empty">No models match. Refresh the list or try another name.</p>
            ) : (
              filtered.map((model) => {
                const checked = selectedIds.includes(model.id);
                return (
                  <label className="picker-row" key={model.id}>
                    <input type="checkbox" checked={checked} onChange={() => onToggle(model.id)} />
                    <span className="picker-row-copy">
                      <span className="picker-row-name">{model.name}</span>
                      <span className="picker-row-id">{model.id}</span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <div className="picker-foot">
            <span>{models.length} available</span>
            <div className="picker-foot-actions">
              {onRefresh ? (
                <button type="button" className="btn btn-quiet btn-sm" onClick={onRefresh}>
                  <RefreshCw size={11} /> Refresh
                </button>
              ) : null}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
