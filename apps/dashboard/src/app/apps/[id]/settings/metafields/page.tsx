"use client";
import {
  Container,
  Heading,
  Card,
  Flex,
  Box,
  Button,
  TextField,
  Text,
  Select,
  Separator,
  Checkbox,
} from "@radix-ui/themes";
import { MetaFieldRow } from "./meta-field-row";
import { PlusIcon } from "@radix-ui/react-icons";
import { Metafield } from "@/types";
import { useEffect, useState } from "react";
import { useForm, SubmitHandler, Controller } from "react-hook-form";
import { Toaster, toast } from "sonner";
type Inputs = {
  name: string;
  type: string;
  on_register: boolean;
  on_profile: boolean;
};

export default function MetafieldsSettings() {
  const [metafields, setMetafields] = useState<Metafield[]>([]);

  const addMetafield = (metafield: Metafield) => {
    setMetafields([...metafields, metafield]);
  };

  const removeMetaFieldByFieldName = (field_name: string) => {
    setMetafields(
      metafields.filter((metafield) => metafield.field_name !== field_name)
    );
  };

  return (
    <>
      {" "}
      <Toaster />
      <Container size="3">
        <Flex direction="column" gap="3">
          <Card>
            <Heading size="4">Add a metafield</Heading>
            <Text size="2">
              Metafields are used to add additional information to your users
            </Text>
            <MetaFieldRow
              defaultViewModeEdit={true}
              variant="ghost"
              onFormSubmit={(metafield) => addMetafield(metafield)}
            />
          </Card>
          <Flex direction="column" gap="1">
            {metafields.map((metafield, index) => (
              <MetaFieldRow
                metafield={metafield}
                key={index}
                removeMetaFieldByFieldName={removeMetaFieldByFieldName}
              />
            ))}
          </Flex>
        </Flex>
      </Container>
    </>
  );
}
