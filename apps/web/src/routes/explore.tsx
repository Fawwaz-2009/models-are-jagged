import { createFileRoute } from "@tanstack/react-router";
import { useAppMeta } from "../components/brand.tsx";
import { PublicCatalogPage } from "../components/public/public-catalog.tsx";
import { Studio } from "../components/studio/studio.tsx";

export const Route = createFileRoute("/explore")({
  component: Explore,
});

function Explore() {
  const meta = useAppMeta();
  if (meta.publicMode) return <PublicCatalogPage />;
  return <Studio view="explore" />;
}
