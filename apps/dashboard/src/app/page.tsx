import { redirect } from "next/navigation";
import { getCurrentUser } from "@/api";
import { PATHS } from "./routes";
import { Flex, Container } from "@radix-ui/themes";
import Auth from "@/components/Auth";

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    redirect(PATHS.APPS);
  }

  return (
    <div>
      <Container size="3">
        <Flex align="center" justify="center" style={{ height: "100vh" }}>
          <Auth />
        </Flex>
      </Container>
    </div>
  );
}
