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
            fallback={
              (
                (currentUser.meta?.first_name as string | null) ??
                currentUser.email
              )?.charAt(0) ?? (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25
              8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0
              0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z"
                  />
                </svg>
              )
            }
            color="pink"
          />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <Link href={PATHS.PROFILE} legacyBehavior>
          <DropdownMenu.Item
            style={{
              cursor: "pointer",
            }}
          >
            View profile
          </DropdownMenu.Item>
        </Link>
        <DropdownMenu.Item
          onClick={() => signOut()}
          style={{
            cursor: "pointer",
          }}
        >
          Logout
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
};
