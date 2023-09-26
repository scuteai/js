"use client";
import Link from "next/link";
import type { UniqueIdentifier, ScuteUserData } from "@/types";
import { DropdownMenu, Flex, IconButton } from "@radix-ui/themes";
import { DotsHorizontalIcon, EyeOpenIcon } from "@radix-ui/react-icons";
import { PATHS } from "@/app/routes";
import { UsersTableProps } from "./UsersTable";
import { toast } from "sonner";

interface AppUserActionsProps {
  appId: UniqueIdentifier;
  user: ScuteUserData;
  activateUser: UsersTableProps["activateUser"];
  deactivateUser: UsersTableProps["deactivateUser"];
}

export const AppUserActions = ({
  appId,
  user,
  activateUser,
  deactivateUser,
}: AppUserActionsProps) => {
  const userUrl = PATHS.APP_USER.replace("[appId]", appId as string).replace(
    "[userId]",
    user.id as string
  );

  return (
    <Flex gap="3" align="center" justify="end">
      <Flex gap="2" align="center">
        <Link href={userUrl}>
          <IconButton color="gray" size="1" variant="ghost">
            <EyeOpenIcon />
          </IconButton>
        </Link>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <IconButton color="gray" size="1" variant="ghost">
              <DotsHorizontalIcon />
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <Link legacyBehavior href={userUrl}>
              <DropdownMenu.Item
                style={{
                  cursor: "pointer",
                }}
                shortcut="⌘ V"
              >
                View
              </DropdownMenu.Item>
            </Link>
            {user.status === "active" ? (
              <DropdownMenu.Item
                style={{
                  cursor: "pointer",
                }}
                shortcut="⌘ D"
                onClick={async () => {
                  const isSuccess = await deactivateUser(user.id);
                  if (isSuccess) {
                    toast.success("success! [deactivateuser]");
                  } else {
                    toast.error("error! [deactivateuser]");
                  }
                }}
              >
                Deactivate
              </DropdownMenu.Item>
            ) : user.status === "inactive" ? (
              <DropdownMenu.Item
                style={{
                  cursor: "pointer",
                }}
                shortcut="⌘ A"
                onClick={async () => {
                  const isSuccess = await activateUser(user.id);
                  if (isSuccess) {
                    toast.success("success! [activateuser]");
                  } else {
                    toast.error("error! [activateuser]");
                  }
                }}
              >
                Activate
              </DropdownMenu.Item>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </Flex>
    </Flex>
  );
};
