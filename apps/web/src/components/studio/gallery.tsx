import { ArrowUpRight, Image as ImageIcon, Sparkles } from "lucide-react";
import { formatDate, truncate } from "../../lib/format.ts";
import { studio, uniqueModels } from "../../lib/store.ts";
import type { StudioState } from "../../lib/store.ts";
import type { CreationRecord } from "../../lib/types.ts";
import type { CSSProperties } from "react";

const suggestions = [
  { text: "A brass observatory on a basalt cliff, dawn light, one impossible window.", tag: "architecture", short: "Brass observatory" },
  { text: "A transit map for a city that only exists between midnight and three.", tag: "system", short: "City after midnight" },
  { text: "A field guide plate for six invented houseplants, ink and watercolor.", tag: "illustration", short: "Invented houseplants" },
  { text: "A poster for a one-room museum of rain, Swiss grid, one photograph.", tag: "graphic", short: "Museum of rain" },
] as const;

export function RunCard({ creation, state }: { creation: CreationRecord; state: StudioState }) {
  const done = creation.trials.filter((trial) => trial.status === "done" && trial.assetId && state.assetUrls[trial.assetId]);
  const shown = done.slice(0, 4);
  const models = uniqueModels([creation]);
  const running =
    Boolean(state.running[creation.id]) || creation.trials.some((trial) => trial.status === "composing" || trial.status === "rendering" || trial.status === "queued");
  const firstAsset = shown[0]?.assetId ? state.assets[shown[0].assetId] : undefined;
  const ratio = firstAsset?.width && firstAsset.height ? `${firstAsset.width} / ${firstAsset.height}` : "1";

  return (
    <article
      className="run-card"
      data-running={running}
      role="button"
      tabIndex={0}
      onClick={() => studio.openDetail(creation.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          studio.openDetail(creation.id);
        }
      }}
      aria-label={`Open run: ${truncate(creation.brief, 90)}`}
    >
      {running ? <span className="progress-line" /> : null}
      <div className="relative">
        <span className="card-badge">{creation.medium === "svg" ? "SVG" : "Image"}</span>
        <span className="card-count">
          {done.length}/{creation.trials.length}
        </span>
        {shown.length > 0 ? (
          <div className="cover-grid" data-count={shown.length} style={{ "--ratio": ratio } as CSSProperties}>
            {shown.map((trial, index) => {
              const asset = trial.assetId ? state.assets[trial.assetId] : undefined;
              const url = trial.assetId ? state.assetUrls[trial.assetId] : undefined;
              const more = index === 3 && done.length > 4 ? `+${done.length - 4}` : undefined;
              return (
                <div className="cover-cell" key={trial.id} data-more={more}>
                  {url ? <img src={url} alt="" loading="lazy" draggable={false} /> : null}
                  {!asset && running ? <div className="skeleton h-full w-full" /> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="cover-empty">
            <span>
              {running ? (
                <>
                  <span className="spinner mx-auto mb-2" />
                  {creation.trials.some((trial) => trial.status === "composing") ? "Composing prompts" : "Rendering"}
                </>
              ) : (
                "No output yet"
              )}
            </span>
          </div>
        )}
      </div>

      <div className="run-body">
        <h2 className="run-title">{truncate(creation.brief, 160)}</h2>
        <div className="run-sub">
          <span>{formatDate(creation.createdAt)}</span>
          <span className="dot" />
          <span>{creation.mode === "compose" ? "compose" : "direct"}</span>
          <span className="dot" />
          <span>{creation.trials.length} trials</span>
          {running ? (
            <>
              <span className="dot" />
              <span className="run-status">running</span>
            </>
          ) : null}
          {creation.published ? (
            <>
              <span className="dot" />
              <span className="text-[var(--orange)]">published</span>
            </>
          ) : null}
        </div>
        <div className="run-models">
          {models.slice(0, 3).map((model) => (
            <span className="chip" key={model.id}>
              {model.name}
            </span>
          ))}
          {models.length > 3 ? <span className="chip">+{models.length - 3}</span> : null}
          {creation.medium === "image" ? null : <span className="chip chip-accent">vector</span>}
        </div>
      </div>
    </article>
  );
}

export function EmptyState({ onSuggest }: { onSuggest: (text: string) => void }) {
  return (
    <section className="empty-state">
      <div>
        <span className="eyebrow">A local-first comparison studio</span>
        <h1>
          One brief.
          <br />
          A jagged
          <br />
          frontier.
        </h1>
        <p className="lede">
          Every model is good at something different. Send one brief down several paths, then keep the frames, prompts, seeds, costs, and mistakes attached. Your key and
          your gallery stay in this browser until you publish a snapshot.
        </p>
        <div className="starter-row">
          {suggestions.map(({ text, tag, short }) => (
            <button type="button" className="starter" key={text} onClick={() => onSuggest(text)}>
              <span className="eyebrow">{tag}</span>
              <span className="starter-label">{short}</span>
              <ArrowUpRight size={11} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <JaggedChart />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="eyebrow">Same input, uneven capability</span>
          <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--muted)]">
            <Sparkles size={10} /> local by default
          </span>
        </div>
      </div>
    </section>
  );
}

function JaggedChart() {
  return (
    <svg className="jagged-chart" viewBox="0 0 520 390" role="img" aria-label="A jagged capability frontier: the same brief lands unevenly across models.">
      <rect width="520" height="390" fill="var(--card)" />
      {Array.from({ length: 7 }, (_, index) => (
        <line key={`v${index}`} x1={40 + index * 76} y1="30" x2={40 + index * 76} y2="340" stroke="var(--line-soft)" strokeDasharray="2 5" />
      ))}
      {Array.from({ length: 5 }, (_, index) => (
        <line key={`h${index}`} x1="40" y1={60 + index * 70} x2="484" y2={60 + index * 70} stroke="var(--line-soft)" strokeDasharray="2 5" />
      ))}
      <line x1="30" y1="350" x2="500" y2="350" stroke="var(--ink)" strokeWidth="1.5" />
      <line x1="30" y1="350" x2="30" y2="24" stroke="var(--ink)" strokeWidth="1.5" />
      <path d="M40 330 L86 305 L132 316 L186 236 L238 252 L292 172 L344 190 L398 106 L454 132 L488 62" fill="none" stroke="var(--ink)" strokeWidth="2" />
      <path d="M40 330 L86 305 L132 316 L186 236 L238 252 L292 172 L344 190 L398 106 L454 132 L488 62 L488 350 L40 350 Z" fill="var(--orange)" opacity="0.08" />
      {[
        [86, 305],
        [186, 236],
        [292, 172],
        [398, 106],
        [488, 62],
      ].map(([x, y], index) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="4.5" fill={index === 3 ? "var(--orange)" : "var(--card)"} stroke="var(--ink)" strokeWidth="1.5" />
          {index === 3 ? <circle cx={x} cy={y} r="9" fill="none" stroke="var(--orange)" strokeWidth="1" /> : null}
        </g>
      ))}
      <text x="400" y="86" fontFamily="monospace" fontSize="9" letterSpacing="1.5" fill="var(--orange)">
        SAME BRIEF
      </text>
      <line x1="398" y1="92" x2="398" y2="120" stroke="var(--orange)" strokeWidth="1" />
      <text x="42" y="374" fontFamily="monospace" fontSize="8" letterSpacing="1.5" fill="var(--muted)">
        MODELS / TASKS
      </text>
      <text x="30" y="20" fontFamily="monospace" fontSize="8" letterSpacing="1.5" fill="var(--muted)">
        FIT
      </text>
      <g transform="translate(350 300)">
        <rect width="128" height="32" fill="var(--ink)" />
        <text x="10" y="20" fontFamily="monospace" fontSize="8" letterSpacing="1.3" fill="var(--paper)">
          UNEVEN BY NATURE
        </text>
      </g>
    </svg>
  );
}

export function Gallery({ state, onSuggest }: { state: StudioState; onSuggest: (text: string) => void }) {
  const models = uniqueModels(state.creations);
  const query = state.query.trim().toLowerCase();
  const filtered = state.creations.filter((creation) => {
    if (state.filterMedium !== "all" && creation.medium !== state.filterMedium) return false;
    if (state.filterModel && !creation.trials.some((trial) => trial.modelId === state.filterModel && trial.status === "done")) return false;
    if (!query) return true;
    if (creation.brief.toLowerCase().includes(query)) return true;
    return creation.trials.some(
      (trial) =>
        trial.prompt.toLowerCase().includes(query) ||
        trial.modelName.toLowerCase().includes(query) ||
        (trial.llmName ?? "").toLowerCase().includes(query) ||
        trial.promptSource.toLowerCase().includes(query),
    );
  });

  return (
    <div>
      {state.creations.length === 0 ? (
        <EmptyState onSuggest={onSuggest} />
      ) : (
        <div className="studio-intro">
          <div>
            <span className="eyebrow">The local gallery</span>
            <h1>Every attempt keeps its receipt.</h1>
          </div>
          <p>
            {state.creations.length} {state.creations.length === 1 ? "run" : "runs"} in this browser. Open one to compare every output, then publish a snapshot when the
            set earns a public link.
          </p>
        </div>
      )}

      {state.creations.length > 0 ? (
        <div className="index-bar">
          <div className="index-left">
            <span className="eyebrow mr-1">{filtered.length} shown</span>
            <button type="button" className="filter-chip" data-active={state.filterMedium === "all"} onClick={() => studio.setFilterMedium("all")}>
              All
            </button>
            <button type="button" className="filter-chip" data-active={state.filterMedium === "image"} onClick={() => studio.setFilterMedium("image")}>
              <ImageIcon size={10} /> Image
            </button>
            <button type="button" className="filter-chip" data-active={state.filterMedium === "svg"} onClick={() => studio.setFilterMedium("svg")}>
              SVG
            </button>
            {models.slice(0, 6).map((model) => (
              <button
                type="button"
                className="filter-chip"
                key={model.id}
                data-active={state.filterModel === model.id}
                onClick={() => studio.setFilterModel(model.id)}
                title={model.id}
              >
                {truncate(model.name, 28)}
              </button>
            ))}
          </div>
          <div className="index-right">
            <input
              className="search-input"
              value={state.query}
              onChange={(event) => studio.setQuery(event.target.value)}
              placeholder="Search briefs, prompts, models"
              aria-label="Search runs"
            />
          </div>
        </div>
      ) : null}

      {state.creations.length > 0 && filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="display text-3xl">No runs match those filters.</p>
          <button
            type="button"
            className="btn btn-small mt-4"
            onClick={() => {
              studio.setFilterMedium("all");
              studio.setFilterModel(null);
              studio.setQuery("");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : null}

      <div className="run-grid">
        {filtered.map((creation) => (
          <RunCard key={creation.id} creation={creation} state={state} />
        ))}
      </div>
    </div>
  );
}
