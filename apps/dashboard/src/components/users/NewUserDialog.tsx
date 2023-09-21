"use client";

import { Button, Flex, Dialog, Text, TextField } from "@radix-ui/themes";

export const NewUserDialog = () => {
  return (
    <Dialog.Root>
      <Dialog.Trigger>
        <Button>Create new user</Button>
      </Dialog.Trigger>

      <Dialog.Content style={{ maxWidth: 450 }}>
        <Dialog.Title>New user</Dialog.Title>
        <Dialog.Description size="2" mb="4">
          User is going to receive an email with a link to set up their account.
        </Dialog.Description>

        <Flex direction="column" gap="3">
         
          <label>
            <Text as="div" size="2" mb="1" weight="bold">
              Email
            </Text>
            <TextField.Input
              defaultValue=""
              placeholder="Enter user's email"
            />
          </label>
        </Flex>

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Dialog.Close>
            <Button>Save</Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};
