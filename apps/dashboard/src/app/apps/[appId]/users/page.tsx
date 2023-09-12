import { getUsers } from "@/api";
import type { UniqueIdentifier } from "@/types";

import { Users } from "@/components/users/Users";

export default async function AppUsers({
  params,
}: {
  params: { appId: UniqueIdentifier };
}) {
  // TODO: error handling
  const users = (await getUsers(params.appId)) ?? [];

  return <Users appId={params.appId} users={users} />;
}
