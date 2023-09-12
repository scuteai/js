"use client";

import { useState, type CSSProperties } from "react";
import type { AppApiKey } from "@/types";

import {
  AlertDialog,
  Button,
  Card,
  Code,
  Dialog,
  Flex,
  Text,
  TextField,
} from "@radix-ui/themes";
import { TrashIcon } from "@radix-ui/react-icons";
import { toast } from "sonner";

interface ApiKeyRowProps extends AppApiKey {
  updateApiKey: (
    id: AppApiKey["id"],
    nickname: AppApiKey["nickname"]
  ) => Promise<AppApiKey | null>;
  revokeApiKey: (id: AppApiKey["id"]) => Promise<boolean>;
}

export const ApiKeyRow = ({
  nickname,
  id,
  updateApiKey,
  revokeApiKey,
}: ApiKeyRowProps) => {
  const [newNickname, setNewNickname] = useState(nickname);

  return (
    <Card variant="surface" size="3">
      <Flex direction="column" gap="5">
        <Flex align="center" justify="between">
          <Code variant="soft" color="lime">
            {nickname}
          </Code>
          <Flex align="center" gap="2">
            <Dialog.Root>
              <Dialog.Trigger>
                <Button size="1" color="blue" onClick={() => {}}>
                  Edit
                </Button>
              </Dialog.Trigger>

              <Dialog.Content size="4" style={{ maxWidth: 450 }}>
                <Dialog.Title>Edit API Key Name</Dialog.Title>
                <Dialog.Description size="2" mb="4">
                  Edit Name
                </Dialog.Description>

                <Flex direction="column" gap="3">
                  <label>
                    <Text as="div" size="2" mb="1" weight="bold">
                      API Key name
                    </Text>
                    <TextField.Input
                      color="pink"
                      variant="soft"
                      placeholder="Enter a new nickname for this API Key"
                      defaultValue={nickname}
                      onChange={(e) => {
                        const nickname = e.target.value;
                        setNewNickname(nickname);
                      }}
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
                    <Button
                      variant="classic"
                      onClick={async () => {
                        const newApiKey = await updateApiKey(id, newNickname);

                        if (newApiKey) {
                          toast.success("success! [api-key-update]");
                        } else {
                          toast.error("error! [api-key-update]");
                        }
                      }}
                    >
                      Save
                    </Button>
                  </Dialog.Close>
                </Flex>
              </Dialog.Content>
            </Dialog.Root>

            <AlertDialog.Root>
              <AlertDialog.Trigger>
                <Button size="1" color="tomato">
                  Revoke <TrashIcon />
                </Button>
              </AlertDialog.Trigger>
              <AlertDialog.Content style={{ maxWidth: 450 }}>
                <AlertDialog.Title>Delete API Key</AlertDialog.Title>
                <AlertDialog.Description size="2">
                  Are you sure you want to delete `{nickname}` API Key? This
                  action cannot be undone.
                </AlertDialog.Description>

                <Flex gap="3" mt="4" justify="end">
                  <AlertDialog.Cancel>
                    <Button variant="soft" color="gray">
                      Cancel
                    </Button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action>
                    <Button
                      color="tomato"
                      variant="classic"
                      onClick={async () => {
                        const isSuccess = await revokeApiKey(id);
                        if (isSuccess) {
                          toast.success("success! [api-key-delete]");
                        } else {
                          toast.error("error! [api-key-delete]");
                        }
                      }}
                    >
                      Delete API Key
                    </Button>
                  </AlertDialog.Action>
                </Flex>
              </AlertDialog.Content>
            </AlertDialog.Root>
          </Flex>
        </Flex>
      </Flex>
    </Card>
  );
};
