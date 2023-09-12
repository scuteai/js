import Link from "next/link";
import type { ScuteUserData } from "@/types";
import { PATHS } from "@/app/routes";
import { Avatar, DropdownMenu, IconButton } from "@radix-ui/themes";

export interface ProfileDropdownProps {
  currentUser: ScuteUserData;
  signOut: () => void;
}

export const ProfileDropdown = ({
  currentUser,
  signOut,
}: ProfileDropdownProps) => {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <IconButton color="gray" size="1" variant="ghost">
          <Avatar
            size="2"
            fallback={(
              (currentUser.meta?.first_name ?? currentUser.email) as string
            ).charAt(0)}
            color="pink"
          />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <Link href={PATHS.PROFILE}>
          <DropdownMenu.Item>View profile</DropdownMenu.Item>
        </Link>
        <DropdownMenu.Item onClick={() => signOut()}>Logout</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
};
