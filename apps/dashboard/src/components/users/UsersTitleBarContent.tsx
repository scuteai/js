"use client";

import { Button, Flex } from "@radix-ui/themes";
import { SearchUser } from "./SearchUser";
import { NewUserDialog } from "./NewUserDialog";

export const UsersTitleBarContent = () => {
  return (
    <Flex gap="3" justify="end">
      <SearchUser />
      <NewUserDialog />
      <Button variant="outline" color="gray">
        Import users
      </Button>
    </Flex>
  );
};
