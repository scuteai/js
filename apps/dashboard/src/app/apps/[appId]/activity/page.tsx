import { getEvents } from "@/api";
import { ActivitiyTable } from "@/components/activity/ActivityTable";
import type { UniqueIdentifier } from "@/types";
import { Container } from "@radix-ui/themes";

export default async function AppActivities({
  params,
  searchParams,
}: {
  params: { appId: UniqueIdentifier };
  searchParams: { q?: string; page?: string; limit?: string };
}) {
  const data = await getEvents(params.appId, {
    // TODO
    page: searchParams.page ?? 1,
    limit: searchParams.limit ?? 10,
  });

  if (!data) {
    // TODO: error handling
    throw new Error("error when loading activities");
  }

  return (
    <Container size="3">
      <ActivitiyTable events={data.events} pagination={data.pagination} />
    </Container>
  );
}
