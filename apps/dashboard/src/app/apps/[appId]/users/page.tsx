import { activateUser, deactivateUser, getUsers } from "@/api";
import type { ListUsersRequestParams, UniqueIdentifier } from "@/types";
import { Container } from "@radix-ui/themes";
import { UsersTable } from "@/components/users/UsersTable";
import { revalidatePath } from "next/cache";
import { PATHS } from "@/app/routes";

export const dynamic = "force-dynamic";

export default async function AppUsers({
  params,
  searchParams,
}: {
  params: { appId: UniqueIdentifier };
  searchParams: ListUsersRequestParams & Record<string, any>;
}) {
  const reqParams: ListUsersRequestParams = {
    id: searchParams.id,
    email: searchParams.q || searchParams.email,
    phone: searchParams.phone,
    created_before: searchParams.created_before,
    status: searchParams.status,
    page: (searchParams.page ?? 1) as number,
    limit: (searchParams.limit ?? 10) as number,
  };

  const data = await getUsers(
    params.appId,
    // remove undefined values
    JSON.parse(JSON.stringify(reqParams))
  );

  const activateUserAction = async (id: UniqueIdentifier) => {
    "use server";

    const user = await activateUser(params.appId, id);

    if (user) {
      revalidatePath(
        PATHS.APP_USERS.replace("[appId]", params.appId as string)
      );
    }

    return user;
  };

  const deactivateUserAction = async (id: UniqueIdentifier) => {
    "use server";

    const user = await deactivateUser(params.appId, id);

    if (user) {
      revalidatePath(
        PATHS.APP_USERS.replace("[appId]", params.appId as string)
      );
    }

    return user;
  };

  if (!data) {
    // TODO: error handling
    throw new Error("error when loading users");
  }

  return (
    <Container size="3">
      <UsersTable
        appId={params.appId}
        users={data.users}
        activateUser={activateUserAction}
        deactivateUser={deactivateUserAction}
        pagination={data.pagination}
      />
    </Container>
  );
}
