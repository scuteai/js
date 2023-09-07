import {
  Flex,
  Text,
  Button,
  Container,
  Inset,
  Card,
  Box,
  Heading,
  TextField,
  Separator,
} from "@radix-ui/themes";
import { Layout } from "@/components/shared/Layout";
import { STextField } from "@/components/settings/STextField";
import { LogoWashed } from "@/components/shared/Logo";
import { SCardBottom } from "@/components/settings/SCardBottom";
import { useForm, SubmitHandler } from "react-hook-form";
import { Toaster, toast } from 'sonner';
type Inputs = {
  name: string;
  origin: string;
};

export default function NewApp() {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = (data) => {
    // toast('Success')
    console.log('success')
  };

  return (
    <Layout>
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
                register={register('name', { required: true })}
              />
              <STextField
                title="Domain of your app"
                description={`Enter the domain that you will use Scute on. Some examples are 'https://example.com' or 'http://localhost:8080'. `}
                placeholder="https://myawesomeapp.com"
                register={register('origin', { required: true })}
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
      <Toaster />
    </Layout>
  );
}
