import { getUsers } from "@/api";
import type { UniqueIdentifier } from "@/types";
import { Container } from "@radix-ui/themes";
import { UsersTable } from "@/components/users/UsersTable";

export const dynamic = "force-dynamic";

export default async function AppUsers({
  params,
  searchParams,
}: {
  params: { appId: UniqueIdentifier };
  searchParams: { q?: string; page?: string; limit?: string };
}) {
  const data = await getUsers(params.appId, {
    // TODO
    page: searchParams.page ?? 1,
    limit: searchParams.limit ?? 10,
  });

  if (!data) {
    // TODO: error handling
    throw new Error("error when loading users");
  }

  return (
    <Container size="3">
      <UsersTable
        appId={params.appId}
        users={data.users}
        pagination={data.pagination}
      />
    </Container>
  );
}
