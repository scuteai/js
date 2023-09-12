"use client";
import { useRouter } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { toast } from "sonner";
import type { ScuteApp, ScuteAppData } from "@/types";
import { PATHS } from "@/app/routes";
import { Flex, Button, Container, Card, Heading } from "@radix-ui/themes";
import { LogoWashed } from "@/components/shared/Logo";
import { STextField } from "../settings/STextField";
import { SCardBottom } from "../settings/SCardBottom";

interface NewAppContainerProps {
  createApp: (
    app: Partial<ScuteApp>
  ) => Promise<{ data: { app: ScuteAppData } | null }>;
}

type NewAppInputs = Pick<ScuteAppData, "name" | "origin">;

export const NewAppContainer = ({ createApp }: NewAppContainerProps) => {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewAppInputs>();

  const onSubmit: SubmitHandler<NewAppInputs> = async (values) => {
    const { data } = await createApp(values);
    if (data) {
      toast.success("success! [appcreation]");
      router.push(PATHS.APP.replace("[appId]", data.app.id as string));
      return;
    } else {
      toast.error("error! [appcreation]");
    }
  };

  return (
    <>
      <Container size="2">
        <form onSubmit={handleSubmit(onSubmit)}>
          <Card size="4">
            <Flex style={{ marginBottom: "40px" }}>
              <LogoWashed />
            </Flex>
            <Flex direction="column" style={{ marginBottom: "40px" }}>
              <Heading size="4">Create a new app</Heading>
            </Flex>
            <Flex direction="column" gap="5">
              <STextField
                title="Application name"
                description="Give your application a friendly, human-readable name. You can always edit this later. "
                placeholder="My awesome app"
                {...register("name", { required: true })}
              />
              <STextField
                title="Domain of your app"
                description={`Enter the domain that you will use Scute on. Some examples are 'https://example.com' or 'http://localhost:8080'. `}
                placeholder="https://myawesomeapp.com"
                {...register("origin", { required: true })}
              />
              <Flex style={{ marginTop: "20pxx" }} />
              <SCardBottom>
                <Flex align="center" gap="5">
                  <Button variant="ghost" color="gray" size="3">
                    Cancel
                  </Button>
                  <Button type="submit" variant="classic" size="3">
                    Create
                  </Button>
                </Flex>
              </SCardBottom>
            </Flex>
          </Card>
        </form>
      </Container>
    </>
  );
};
