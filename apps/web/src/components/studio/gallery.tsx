import { AssetGrid, AssetTile } from "../asset-tile.tsx";
import { formatDate, truncate } from "../../lib/format.ts";
import { studio } from "../../lib/store.ts";
import type { StudioState } from "../../lib/store.ts";
import type { CreationRecord } from "../../lib/types.ts";

const suggestions = [
  "A brass observatory on a basalt cliff, dawn light, one impossible window.",
  "A transit map for a city that only exists between midnight and three.",
  "A field guide plate for six invented houseplants, ink and watercolor.",
  "A poster for a one-room museum of rain, Swiss grid, one photograph.",
];

const modeLabel = (creation: CreationRecord): string => (creation.mode === "compose" ? "Refined" : "As written");

export function Gallery({ state, onSuggest }: { state: StudioState; onSuggest: (text: string) => void }) {
  if (!state.ready) {
    return (
      <AssetGrid>
        {Array.from({ length: 12 }, (_, index) => (
          <div className="asset-tile" key={index}>
            <div className="asset-tile-loading" />
          </div>
        ))}
      </AssetGrid>
    );
  }

  if (state.creations.length === 0) {
    return (
      <section className="empty-state">
        <span className="empty-mark">J</span>
        <h1 className="empty-title">Nothing here yet.</h1>
        <p className="empty-text">Write a brief below. Refine it with a language model or send it as written, then compare what comes back.</p>
        <div className="empty-examples">
          {suggestions.map((text) => (
            <button type="button" className="empty-example" key={text} onClick={() => onSuggest(text)}>
              {truncate(text, 84)}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <AssetGrid>
      {state.creations.flatMap((creation) =>
        creation.outputs.map((output) => {
          const url = output.assetId ? state.assetUrls[output.assetId] : undefined;
          const running = output.status === "queued" || output.status === "composing" || output.status === "rendering";
          const failed = output.status === "error" || output.status === "cancelled";
          const status = running
            ? output.status === "composing"
              ? "Writing prompt"
              : output.status === "queued"
                ? "Queued"
                : "Rendering"
            : failed
              ? "Failed"
              : formatDate(creation.createdAt);
          const meta = `${output.modelName} · ${status} · ${modeLabel(creation)}${creation.published ? " · Published" : ""}`;

          return (
            <AssetTile
              key={output.id}
              imageUrl={url}
              alt={truncate(creation.brief, 100)}
              title={truncate(creation.brief, 120)}
              meta={meta}
              running={running}
              selected={state.selected.includes(output.id)}
              onOpen={() => studio.openOutput(creation.id, output.id)}
            />
          );
        }),
      )}
    </AssetGrid>
  );
}
