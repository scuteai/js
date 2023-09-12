"use client";

import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { Button, Flex, TextField } from "@radix-ui/themes";

export const UsersTitleBarContent = () => {
  return (
    <Flex gap="3" justify="end">
      <TextField.Root>
        <TextField.Slot>
          <MagnifyingGlassIcon height="16" width="16" />
        </TextField.Slot>
        <TextField.Input placeholder="Search users" />
      </TextField.Root>
      <Button variant="outline">Create new user</Button>
      <Button variant="outline" color="gray">
        Import users
      </Button>
    </Flex>
  );
};
