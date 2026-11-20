import { createFileRoute } from "@tanstack/react-router";
import { PublicCatalogPage } from "../components/public/public-catalog.tsx";

export const Route = createFileRoute("/explore")({
  component: Explore,
});

function Explore() {
  return <PublicCatalogPage mode="explore" />;
}
