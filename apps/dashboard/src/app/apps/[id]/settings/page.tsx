"use client";
import {
  Flex,
  Text,
  Button,
  Container,
  Card,
  Heading,
  TextField,
  Portal,
} from "@radix-ui/themes";
import { STextField } from "@/components/settings/STextField";
import { SCardBottom } from "@/components/settings/SCardBottom";
import { CopyIcon } from "@radix-ui/react-icons";
import { useForm, SubmitHandler, Controller } from "react-hook-form";
import { Toaster, toast } from "sonner";
import styles from "@/styles/Settings.module.scss";

type Inputs = {
  name: string;
  origin: string;
};

export default function AppSettings() {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isDirty, isSubmitting, isValid },
  } = useForm<IFormInputs>();

  const onSubmit: SubmitHandler<Inputs> = (data) => {
    // toast('Success')
    console.log("success");
  };

  const SectionDelete = () => (
    <Card size="3">
      <Flex direction="column" gap="5">
        <Heading color="tomato">Danger zone</Heading>
        <Text
          size="1"
          color="tomato"
        >{`Once you’ve deleted an app this cannot be undone. Please make sure you are certain before deleting.`}</Text>

        <Flex style={{ marginBottom: "10px" }} />
        <SCardBottom>
          <Button size="2" color="tomato" variant="classic">
            Delete application
          </Button>
        </SCardBottom>
      </Flex>
    </Card>
  );

  const SectionAppIdCopy = () => (
    <Card size="3">
      <Flex direction="column" gap="5">
        <Heading color="gray">Info</Heading>
        <STextField
          title="Application ID"
          disabled
          value="app_1234567890"
          inputActionSlot={
            <Button size="1" variant="outline">
              <CopyIcon /> Copy
            </Button>
          }
        />
        <STextField title="Public key" placeholder="My App" />
        <STextField
          title="Scute API URL"
          value="https://api.scute.io/app_13425435"
          disabled
        />
      </Flex>
    </Card>
  );

  // TODO: Styles not working on Portal, maybe App Routes ?
  const SaveBar = () => (
    <Portal>
      <Flex justify="end" className={styles.SaveBar}>
        something changed{" "}
        <Button
          style={{ width: "50%", background: "red" }}
          onClick={handleSubmit(onSubmit)}
        >
          Save
        </Button>
      </Flex>
    </Portal>
  );

  return (
    <Container size="2">
      {isDirty && <SaveBar />}
      <form onSubmit={handleSubmit(onSubmit)}>
        <Flex direction="column" gap="4">
          {/* Section App Config  */}
          <Card size="3">
            <Flex direction="column" gap="5">
              <Heading color="gray">Application Config</Heading>

              <Controller
                name="on_profile"
                control={control}
                rules={{ required: false }}
                render={({ field, fieldState }) => (
                  <TextField.Input
                    size="3"
                    placeholder="Application name name"
                    value={field.value}
                    onChange={field.onChange}
                  ></TextField.Input>
                )}
              />

              <STextField
                title="Application name"
                description="The name of your application."
                placeholder="My App"
                separator
              />
              <STextField
                title="Auth origin"
                description="The url of your application."
                placeholder="/"
                separator
              />
              <STextField
                title="Callback URL"
                description="The name of your application."
                placeholder="/"
                separator
              />
              <STextField
                title="Login URL"
                description="The name of your application."
                placeholder="/"
              />

              <Flex style={{ marginBottom: "10px" }} />
            </Flex>
          </Card>

          <SectionAppIdCopy />
          <SectionDelete />
        </Flex>
      </form>
    </Container>
  );
}
