import { revalidatePath } from "next/cache";
import { deleteApiKey, getApiKeys, updateApiKey } from "@/api";
import type { AppApiKey, UniqueIdentifier } from "@/types";
import { PATHS } from "@/app/routes";

import { Flex, Text, Button, Container, Card, Heading } from "@radix-ui/themes";
import { ApiKeyRow } from "@/components/api-keys/ApiKeyRow";

export default async function ApiKeysSettings({
  params,
}: {
  params: { appId: UniqueIdentifier };
}) {
  const { api_keys: apiKeys } = await getApiKeys(params.appId);

  const updateApiKeyAction = async (
    id: AppApiKey["id"],
    nickname: AppApiKey["nickname"]
  ) => {
    "use server";
    const data = await updateApiKey(params.appId, id, nickname);

    if (data?.api_key) {
      revalidatePath(
        PATHS.APP_API_KEY_SETTINGS.replace("[appId]", params.appId as string)
      );
    }

    return data?.api_key ?? null;
  };

  const revokeApiKeyAction = async (id: AppApiKey["id"]) => {
    "use server";

    const isSuccess = await deleteApiKey(params.appId, id);

    if (isSuccess) {
      revalidatePath(
        PATHS.APP_API_KEY_SETTINGS.replace("[appId]", params.appId as string)
      );
    }

    return isSuccess;
  };
  

  return (
    <Container size="2">
      <Flex direction="column" gap="2">
        {apiKeys.length === 0
          ? "No API keys found."
          : apiKeys.map((apiKey) => (
              <ApiKeyRow
                key={apiKey.id}
                id={apiKey.id}
                nickname={apiKey.nickname}
                bearer_id={apiKey.nickname}
                created_at={apiKey.created_at}
                updateApiKey={updateApiKeyAction}
                revokeApiKey={revokeApiKeyAction}
              />
            ))}
      </Flex>
      <Flex direction="column" gap="2" style={{ marginTop: "60px" }}>
        <Card variant="surface" size="3">
          <Flex direction="column" gap="3">
            <Flex direction="column">
              <Heading size="3">Documentation</Heading>
              <Text size="2">
                Not sure how to use Scute? You can learn about our API on our
                documentation page
              </Text>
            </Flex>
            <Flex>
              <Button variant="outline" color="lime">
                View documentation
              </Button>
            </Flex>
          </Flex>
        </Card>
      </Flex>
    </Container>
  );
}
