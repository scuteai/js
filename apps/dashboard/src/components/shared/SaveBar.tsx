import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import styles from "@/styles/SaveBar.module.scss";
import { AlertDialog, Button, Flex, Portal } from "@radix-ui/themes";

interface SaveBarProps {
  handleSave: () => void;
  handleDiscard: () => void;
}

export const SaveBar = ({ handleSave, handleDiscard }: SaveBarProps) => {
  const [showUnsavedChangesAlert, setShowUnsavedChangesAlert] = useState(false);
  const [lastPushParams, setLastPushParams] =
    useState<Parameters<typeof router.push>>();

  const router = useRouter();
  const originalRouterPush = useCallback(router.push, []);

  useEffect(() => {
    (router.push as typeof originalRouterPush) = (...params) => {
      setShowUnsavedChangesAlert(true);
      setLastPushParams(params);
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      router.push = originalRouterPush;
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  return (
    <Portal>
      <Flex justify="end" className={styles.SaveBar}>
        <Button
          style={{ width: "50%", background: "red" }}
          onClick={() => handleSave()}
        >
          Save
        </Button>
        <Button
          style={{ width: "50%", background: "black", color: "white" }}
          onClick={() => handleDiscard()}
        >
          Discard
        </Button>
      </Flex>
      {showUnsavedChangesAlert ? (
        <>
          <AlertDialog.Root defaultOpen={true}>
            <AlertDialog.Content style={{ maxWidth: 450 }}>
              <AlertDialog.Title>Unsaved Changes</AlertDialog.Title>
              <AlertDialog.Description size="2">
                Any changes will be lost if you navigate away from this page.
                Are you sure?
              </AlertDialog.Description>

              <Flex gap="3" mt="4" justify="end">
                <AlertDialog.Action>
                  <Button
                    color="red"
                    onClick={() => {
                      if (!lastPushParams) return;

                      originalRouterPush(...lastPushParams);
                    }}
                  >
                    Discard Changes
                  </Button>
                </AlertDialog.Action>
                <AlertDialog.Cancel>
                  <Button
                    variant="soft"
                    color="gray"
                    onClick={() => {
                      setShowUnsavedChangesAlert(false);
                    }}
                  >
                    Stay on page
                  </Button>
                </AlertDialog.Cancel>
              </Flex>
            </AlertDialog.Content>
          </AlertDialog.Root>
        </>
      ) : null}
    </Portal>
  );
};
