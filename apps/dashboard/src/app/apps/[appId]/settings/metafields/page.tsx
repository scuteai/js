import { revalidatePath } from "next/cache";
import {
  getMetaFields,
  createMetaField,
  updateMetaField,
  deleteMetaField,
} from "@/api";
import type { UniqueIdentifier, ScuteUserMetaDataSchema } from "@/types";
import { Container, Heading, Card, Flex, Text } from "@radix-ui/themes";
import { MetaFieldRow } from "@/components/metafields/MetafieldRow";
import { PATHS } from "@/app/routes";

export default async function MetafieldsSettings({
  params,
}: {
  params: { appId: UniqueIdentifier };
}) {
  const metafields = await getMetaFields(params.appId);

  const createMetaFieldAction = async (
    metafield: Partial<ScuteUserMetaDataSchema>
  ) => {
    "use server";
    const data = await createMetaField(params.appId, metafield);
    if (data) {
      revalidatePath(
        PATHS.APP_METAFIELD_SETTINGS.replace("[appId]", params.appId as string)
      );
      revalidatePath(PATHS.PROFILE);
    }

    return data;
  };

  const updateMetaFieldAction = async (
    metafield: Omit<Partial<ScuteUserMetaDataSchema>, "id"> & {
      id: UniqueIdentifier;
    }
  ) => {
    "use server";
    const data = await updateMetaField(params.appId, metafield);
    if (data) {
      revalidatePath(
        PATHS.APP_METAFIELD_SETTINGS.replace("[appId]", params.appId as string)
      );
      revalidatePath(PATHS.PROFILE);
    }

    return data;
  };

  const removeMetaFieldAction = async (id: ScuteUserMetaDataSchema["id"]) => {
    "use server";
    const isSuccess = await deleteMetaField(params.appId, id);
    if (isSuccess) {
      revalidatePath(
        PATHS.APP_METAFIELD_SETTINGS.replace("[appId]", params.appId as string)
      );
      revalidatePath(PATHS.PROFILE);
    }

    return isSuccess;
  };

  return (
    <>
      <Container size="3">
        <Flex direction="column" gap="3">
          <Card>
            <Heading size="4">Add a metafield</Heading>
            <Text size="2">
              Metafields are used to add additional information to your users
            </Text>
            <MetaFieldRow
              viewMode="add"
              variant="ghost"
              addMetaField={createMetaFieldAction}
              editMetaField={updateMetaFieldAction}
              removeMetaField={removeMetaFieldAction}
            />
          </Card>
          <Flex direction="column" gap="1">
            {metafields.map((metafield) => (
              <MetaFieldRow
                key={metafield.id}
                metafield={metafield}
                addMetaField={createMetaFieldAction}
                editMetaField={updateMetaFieldAction}
                removeMetaField={removeMetaFieldAction}
              />
            ))}
          </Flex>
        </Flex>
      </Container>
    </>
  );
}
