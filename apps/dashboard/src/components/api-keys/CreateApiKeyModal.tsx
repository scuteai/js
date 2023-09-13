"use client";

import { useRef, useState } from "react";
import type { AppApiKey } from "@/types";
import { Button, Code, Dialog, Flex, Text, TextField } from "@radix-ui/themes";
import { CopyIcon } from "@radix-ui/react-icons";
import { toast } from "sonner";

interface CreateApiKeyModalProps {
  createApiKey: (nickname: AppApiKey["nickname"]) => Promise<AppApiKey | null>;
}

export const CreateApiKeyModal = ({ createApiKey }: CreateApiKeyModalProps) => {
  const [nickname, setNickname] = useState("");
  const [showCreatedContent, setShowCreatedContent] = useState(false);
  const [apiKey, setApiKey] = useState<string>();

  return (
    <Dialog.Root>
      <Dialog.Trigger>
        <Button variant="classic">Create new key</Button>
      </Dialog.Trigger>

      {showCreatedContent && apiKey ? (
        <ApiKeyCreatedDialogContent
          apiKey={apiKey}
          onClose={() => {
            setShowCreatedContent(false);
            setApiKey(undefined);
          }}
        />
      ) : (
        <Dialog.Content size="4" style={{ maxWidth: 450 }}>
          <Dialog.Title>Create API Key</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Name your new API Key.
          </Dialog.Description>

          <Flex direction="column" gap="3">
            <label>
              <Text as="div" size="2" mb="1" weight="bold">
                API Key name
              </Text>
              <TextField.Input
                color="pink"
                variant="soft"
                placeholder="Enter a nickname for this API Key"
                onChange={(e) => {
                  const nickname = e.target.value;
                  setNickname(nickname);
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

            <Button
              variant="classic"
              onClick={async () => {
                const createdApiKey = await createApiKey(nickname);

                if (createdApiKey) {
                  setShowCreatedContent(true);
                  const key = createdApiKey.token_digest;
                  if (!key) {
                    toast.error("error! [api-key-create]");
                  } else {
                    setApiKey(key);
                  }
                } else {
                  toast.error("error! [api-key-create]");
                }
              }}
            >
              Save
            </Button>
          </Flex>
        </Dialog.Content>
      )}
    </Dialog.Root>
  );
};

export const ApiKeyCreatedDialogContent = ({
  apiKey,
  onClose,
}: {
  apiKey: string;
  onClose: () => void;
}) => {
  const apiKeyCodeRef = useRef<HTMLTextAreaElement>(null);

  return (
    <Dialog.Content
      size="4"
      style={{ maxWidth: 450 }}
      onInteractOutside={(e) => e.preventDefault()}
    >
      <Dialog.Title>API Key Created</Dialog.Title>
      <Dialog.Description size="2" mb="4">
        Copy this key and save it somewhere safe. For security reasons we cannot
        show it to you again.
      </Dialog.Description>

      <Flex>
        <Code
          size="1"
          variant="soft"
          color="red"
          style={{ letterSpacing: "0.5px", width: "100%" }}
        >
          <textarea
            ref={apiKeyCodeRef}
            readOnly
            style={{
              all: "unset",
              width: "100%",
              height: "1rem",
            }}
          >
            {apiKey}
          </textarea>
        </Code>
      </Flex>

      <Flex mt="2" justify="end">
        <Button
          size="1"
          variant="surface"
          onClick={() => {
            if (!apiKeyCodeRef.current) return;
            apiKeyCodeRef.current.select();
            apiKeyCodeRef.current.focus();
            document.execCommand("copy");

            toast.success("Copied!");
          }}
        >
          <CopyIcon />
          Copy
        </Button>
      </Flex>

      <Flex gap="3" mt="4" justify="center">
        <Dialog.Close>
          <Button variant="classic" onClick={() => onClose()}>
            Done
          </Button>
        </Dialog.Close>
      </Flex>
    </Dialog.Content>
  );
};
