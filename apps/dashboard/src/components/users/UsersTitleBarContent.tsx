"use client";

import { Button, Flex } from "@radix-ui/themes";
import { SearchUser } from "./SearchUser";

export const UsersTitleBarContent = () => {
  return (
    <Flex gap="3" justify="end">
      <SearchUser />
      <Button variant="outline">Create new user</Button>
      <Button variant="outline" color="gray">
        Import users
      </Button>
    </Flex>
  );
};
