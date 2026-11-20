import { createFileRoute } from "@tanstack/react-router";
import { PublicRunPage } from "../components/public/public-catalog.tsx";

export const Route = createFileRoute("/p/$publicationId")({
  component: PublicationRoute,
});

function PublicationRoute() {
  const { publicationId } = Route.useParams();
  return <PublicRunPage id={publicationId} />;
}
