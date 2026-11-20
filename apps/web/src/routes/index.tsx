import { createFileRoute } from "@tanstack/react-router";
import { useAppMeta } from "../components/brand.tsx";
import { PublicCatalogPage } from "../components/public/public-catalog.tsx";
import { Studio } from "../components/studio/studio.tsx";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { publish?: string } => ({
    publish: typeof search.publish === "string" ? search.publish : undefined,
  }),
  component: Home,
});

function Home() {
  const meta = useAppMeta();
  const { publish } = Route.useSearch();

  if (meta.publicMode) return <PublicCatalogPage />;
  return <Studio initialPublishId={publish} />;
}
