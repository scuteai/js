import { getApp } from "@/api";
import { UniqueIdentifier } from "@/types";
import { Container } from "@radix-ui/themes";
import { CustomizeCard } from "@/components/customize/CustomizeCard";

export default async function Customize({
  params,
}: {
  params: { appId: UniqueIdentifier };
}) {
  const appData = await getApp(params.appId);
  if (!appData) {
    // TODO: error handling
    throw new Error("App Not Found");
  }

  return (
    <Container size="3">
      <CustomizeCard appData={appData} />
    </Container>
  );
}
