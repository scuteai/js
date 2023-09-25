"use client";

import { Button, Flex } from "@radix-ui/themes";
import { SearchUser } from "./SearchUser";
import { NewUserDialog, NewUserDialogProps } from "./NewUserDialog";

interface UsersTitleBarContentProps extends NewUserDialogProps {}

export const UsersTitleBarContent = ({
  inviteUser,
}: UsersTitleBarContentProps) => {
  return (
    <Flex gap="3" justify="end">
      <SearchUser />
      <NewUserDialog inviteUser={inviteUser} />
      <Button variant="outline" color="gray">
        Import users
      </Button>
    </Flex>
  );
};
