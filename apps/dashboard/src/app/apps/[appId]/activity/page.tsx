import { getEvents } from "@/api";
import { ActivitiyTable } from "@/components/activity/ActivityTable";
import type { UniqueIdentifier } from "@/types";
import { Container } from "@radix-ui/themes";

export default async function AppActivities({
  params,
}: {
  params: { appId: UniqueIdentifier };
}) {
  const { events } = await getEvents(params.appId);

  return (
    <Container size="3">
      <ActivitiyTable events={events} />
    </Container>
  );
}
