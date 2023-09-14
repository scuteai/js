import Link from "next/link";
import type { UniqueIdentifier, ScuteUserData } from "@/types";
import { Badge, DropdownMenu, Flex, IconButton } from "@radix-ui/themes";
import { DotsHorizontalIcon, EyeOpenIcon } from "@radix-ui/react-icons";
import { PATHS } from "@/app/routes";

interface AppUserActionsProps {
  appId: UniqueIdentifier;
  user: ScuteUserData;
}

export const AppUserActions = ({ appId, user }: AppUserActionsProps) => {
  const userUrl = PATHS.APP_USER.replace("[appId]", appId as string).replace(
    "[userId]",
    user.id as string
  );

  return (
    <Flex gap="3" align="center" justify="end">
      <Badge radius="full" color={user.status === "active" ? "green" : "red"}>
        {user.status}
      </Badge>
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
              <DropdownMenu.Item shortcut="⌘ V">View</DropdownMenu.Item>
            </Link>
            {user.status === "active" ? (
              <DropdownMenu.Item shortcut="⌘ D">Deactivate</DropdownMenu.Item>
            ) : (
              <DropdownMenu.Item shortcut="⌘ A">Activate</DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </Flex>
    </Flex>
  );
};
