import { createFileRoute } from "@tanstack/react-router";
import { PublicProfilePage } from "../components/public/public-catalog.tsx";

export const Route = createFileRoute("/u/$handle")({
  component: CreatorRoute,
});

function CreatorRoute() {
  const { handle } = Route.useParams();
  return <PublicProfilePage handle={handle} />;
}
