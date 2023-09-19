import { getUsers } from "@/api";
import type { UniqueIdentifier } from "@/types";
import { Container } from "@radix-ui/themes";
import { UsersTable } from "@/components/users/UsersTable";

export default async function AppUsers({
  params,
}: {
  params: { appId: UniqueIdentifier };
}) {
  // TODO: error handling
  const users = (await getUsers(params.appId)) ?? [];

  return (
    <Container size="3">
      <UsersTable appId={params.appId} users={users} />
    </Container>
  );
}
