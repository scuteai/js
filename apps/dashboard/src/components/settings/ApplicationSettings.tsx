"use client";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { ScuteAppData } from "@/types";
import { PATHS } from "@/app/routes";
import { CopyIcon } from "@radix-ui/react-icons";
import {
  AlertDialog,
  Button,
  Card,
  Container,
  Flex,
  Heading,
  Text,
} from "@radix-ui/themes";
import { STextField } from "./STextField";
import { SCardBottom } from "./SCardBottom";
import { useRouter } from "next/navigation";
import { SaveBar } from "@/components/shared/SaveBar";
import { UpdateAppBodyParams } from "@/api/app";

export type AppSettingsInputs = Pick<
  UpdateAppBodyParams,
  "name" | "origin" | "callback_url" | "login_url"
>;

export interface AppSettingsProps {
  appData: ScuteAppData;
  deleteApp: () => Promise<boolean>;
  updateApp: (data: AppSettingsInputs) => Promise<ScuteAppData | null>;
}

export const AppSettings = ({
  appData,
  updateApp,
  deleteApp,
}: AppSettingsProps) => {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting, isValid },
  } = useForm<AppSettingsInputs>({
    defaultValues: appData,
  });

  return (
    <Container size="2">
      {isDirty && (
        <SaveBar
          handleSave={async () => {
            handleSubmit(
              async (values) => {
                // valid
                const updatedAppData = await updateApp(values);
                if (updatedAppData) {
                  appData = updatedAppData;
                  toast.success("success [appsettings]!");
                  reset({}, { keepValues: true });
                }
              },
              () => {
                // invalid
              }
            )();
          }}
          handleDiscard={() => {
            reset(appData);
          }}
        />
      )}
      <Flex direction="column" gap="4">
        <form>
          {/* Section App Config */}
          <Card size="3">
            <Flex direction="column" gap="5">
              <Heading color="gray">Application Config</Heading>

              <STextField
                title="Application name"
                description="The name of your application."
                placeholder="My App"
                separator
                {...register("name")}
              />
              <STextField
                title="Auth origin"
                description="The url of your application."
                placeholder="/"
                separator
                {...register("origin")}
              />
              <STextField
                title="Callback URL"
                description="The name of your application."
                placeholder="/"
                separator
                {...register("callback_url")}
              />
              <STextField
                title="Login URL"
                description="The name of your application."
                placeholder="/"
                {...register("login_url")}
              />

              <Flex style={{ marginBottom: "10px" }} />
            </Flex>
          </Card>
        </form>

        {/* Section Info */}
        <Card size="3">
          <Flex direction="column" gap="5">
            <Heading color="gray">Info</Heading>
            <STextField
              title="Application ID"
              disabled
              value={appData.id as string}
              inputActionSlot={
                <Button size="1" variant="outline">
                  <CopyIcon /> Copy
                </Button>
              }
            />
            {/* <STextField title="Public key" placeholder="My App" /> */}
            {/* <STextField
          title="Scute API URL"
          value="https://api.scute.io/app_13425435"
          disabled
        /> */}
          </Flex>
        </Card>

        {/* Section Delete */}
        <Card size="3">
          <Flex direction="column" gap="5">
            <Heading color="tomato">Danger zone</Heading>
            <Text
              size="1"
              color="tomato"
            >{`Once you’ve deleted an app this cannot be undone. Please make sure you are certain before deleting.`}</Text>

            <Flex style={{ marginBottom: "10px" }} />
            <SCardBottom>
              <AlertDialog.Root>
                <AlertDialog.Trigger>
                  <Button size="2" color="tomato" variant="classic">
                    Delete application
                  </Button>
                </AlertDialog.Trigger>
                <AlertDialog.Content style={{ maxWidth: 450 }}>
                  <AlertDialog.Title>Delete application</AlertDialog.Title>
                  <AlertDialog.Description size="2">
                    Are you sure?
                  </AlertDialog.Description>

                  <Flex gap="3" mt="4" justify="end">
                    <AlertDialog.Cancel>
                      <Button variant="soft" color="gray">
                        Cancel
                      </Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action>
                      <Button
                        onClick={async () => {
                          const isSuccess = await deleteApp();
                          if (isSuccess) {
                            router.push(PATHS.APPS);
                            toast.success("success! [appdeletion]");
                            return;
                          } else {
                            toast.error(
                              `An error occurred while deleting app: ${appData.name}`
                            );
                            return;
                          }
                        }}
                        color="tomato"
                        variant="classic"
                      >
                        Delete application
                      </Button>
                    </AlertDialog.Action>
                  </Flex>
                </AlertDialog.Content>
              </AlertDialog.Root>
            </SCardBottom>
          </Flex>
        </Card>
      </Flex>
    </Container>
  );
};
