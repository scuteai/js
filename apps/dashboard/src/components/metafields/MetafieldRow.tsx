"use client";
import { useState } from "react";
import type { UniqueIdentifier, ScuteUserMetaDataSchema } from "@/types";

import { useForm, Controller } from "react-hook-form";

import {
  Card,
  Flex,
  Box,
  Button,
  TextField,
  Text,
  Select,
  Checkbox,
  Code,
  AlertDialog,
  Switch,
} from "@radix-ui/themes";
import {
  CheckIcon,
  Pencil1Icon,
  TrashIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import { toast } from "sonner";

type MetaFieldInputs = {
  name: ScuteUserMetaDataSchema["name"];
  field_type: ScuteUserMetaDataSchema["field_type"];
  visible_registration: ScuteUserMetaDataSchema["visible_registration"];
  visible_profile: ScuteUserMetaDataSchema["visible_profile"];
  required: ScuteUserMetaDataSchema["required"];
};

type MetaFieldRowProps = {
  metafield?: ScuteUserMetaDataSchema;
  viewMode?: "add" | "display" | "edit";
  variant?: "surface" | "ghost";
  addMetaField: (metafiled: Partial<ScuteUserMetaDataSchema>) => Promise<ScuteUserMetaDataSchema | null>;
  editMetaField: (
    metafiled: Omit<Partial<ScuteUserMetaDataSchema>, "id"> & { id: UniqueIdentifier }
  ) => Promise<ScuteUserMetaDataSchema | null>;
  removeMetaField: (id: ScuteUserMetaDataSchema["id"]) => Promise<boolean>;
};

export const MetaFieldRow = ({
  metafield,
  viewMode: _viewMode = "display",
  variant = "surface",
  addMetaField,
  editMetaField,
  removeMetaField,
}: MetaFieldRowProps) => {
  const [viewMode, setViewMode] =
    useState<MetaFieldRowProps["viewMode"]>(_viewMode);

  return (
    <Card variant={variant} size="2">
      {viewMode === "display" && metafield ? (
        <DisplayMetaFieldView
          metafield={metafield}
          viewMode={viewMode}
          setViewMode={setViewMode}
          removeMetaField={removeMetaField}
        />
      ) : (
        <AddOrEditMetaFieldView
          metafield={metafield}
          viewMode={viewMode}
          setViewMode={setViewMode}
          addMetaField={addMetaField}
          editMetaField={editMetaField}
        />
      )}
    </Card>
  );
};

const AddOrEditMetaFieldView = ({
  metafield,
  viewMode,
  setViewMode,
  addMetaField,
  editMetaField,
}: {
  metafield: MetaFieldRowProps["metafield"];
  viewMode: MetaFieldRowProps["viewMode"];
  setViewMode: (viewMode: MetaFieldRowProps["viewMode"]) => void;
  addMetaField: MetaFieldRowProps["addMetaField"];
  editMetaField: MetaFieldRowProps["editMetaField"];
}) => {
  const minDefaultValues: Partial<MetaFieldInputs> = {
    visible_registration: true,
    visible_profile: true,
    field_type: "string",
    required: false
  };

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<MetaFieldInputs>({
    defaultValues: metafield ? metafield : minDefaultValues,
  });

  return (
    <form
      onSubmit={(e) => {
        handleSubmit(async (values) => {
          if (viewMode === "add") {
            const newMetafield = await addMetaField(values);
            if (newMetafield) {
              toast.success("success! [metafield-create]");
            } else {
              toast.error("error! [metafield-create]");
            }
          } else {
            const updatedMetafield = await editMetaField({
              ...values,
              id: metafield!.id,
            });
            if (updatedMetafield) {
              toast.success("success! [metafield-update]");
            } else {
              toast.error("error! [metafield-update]");
            }
          }
        })(e);

        reset();

        if (viewMode === "edit") {
          setViewMode("display");
        }
      }}
    >
      <Flex
        gap="2"
        style={{ width: "100%", marginTop: "20px", marginBottom: "10px" }}
      >
        <Box style={{ flexGrow: "1", width: "100%" }}>
          <TextField.Input
            size="3"
            placeholder="Field name"
            {...register("name", { required: true })}
            aria-invalid={errors.name ? "true" : "false"}
          />
        </Box>

        <Controller
          name="field_type"
          control={control}
          rules={{ required: true }}
          render={({ field }) => (
            <Select.Root
              size="3"
              value={field.value}
              onValueChange={field.onChange}
            >
              <Select.Trigger placeholder="Type" />
              <Select.Content>
                <Select.Item value="string">String</Select.Item>
                <Select.Item value="integer">Integer</Select.Item>
                <Select.Item value="date">Date</Select.Item>
                <Select.Item value="boolean">Boolean</Select.Item>
                <Select.Item value="phone">Phone number</Select.Item>
                <Select.Item value="email">Email address</Select.Item>
                <Select.Item value="url">Url</Select.Item>
              </Select.Content>
            </Select.Root>
          )}
        />
        <Button type="submit" size="3">
          {viewMode === "add" ? (
            <>
              Add <PlusIcon />
            </>
          ) : (
            <>Edit</>
          )}
        </Button>

        {viewMode === "edit" ? (
          <Button size="3" color="gray" onClick={() => setViewMode("display")}>
            Cancel
          </Button>
        ) : null}
      </Flex>
      <Flex gap="6">
        <Flex align="center" gap="2">
          <Controller
            name="visible_registration"
            control={control}
            rules={{ required: false }}
            render={({ field }) => (
              <Checkbox
                id="on_register"
                {...field}
                value={undefined}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <label htmlFor="on_register">Registration</label>
        </Flex>
        <Flex align="center" gap="2">
          <Controller
            name="visible_profile"
            control={control}
            rules={{ required: false }}
            render={({ field }) => (
              <Checkbox
                id="on_profile"
                {...field}
                value={undefined}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <label htmlFor="on_profile">Profile</label>
        </Flex>
        <Flex align="center" gap="2">
          <Controller
            name="required"
            control={control}
            rules={{ required: false }}
            render={({ field }) => (
              <Switch
                size="1"
                color="pink"
                {...field}
                value={undefined}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <label htmlFor="required" className="checkbox-label">
            Required
          </label>
        </Flex>
      </Flex>
    </form>
  );
};

const DisplayMetaFieldView = ({
  metafield,
  setViewMode,
  removeMetaField,
}: {
  metafield: NonNullable<MetaFieldRowProps["metafield"]>;
  viewMode: MetaFieldRowProps["viewMode"];
  setViewMode: (viewMode: MetaFieldRowProps["viewMode"]) => void;
  removeMetaField: MetaFieldRowProps["removeMetaField"];
}) => {
  return (
    <>
      <Flex direction="column" gap="5">
        <Flex align="center" justify="between">
          <Flex align="center" gap="2">
            <Text size="3">{metafield.name}</Text>
            <Code variant="soft" color="lime" size="1">
              {metafield.field_type}
            </Code>
          </Flex>
          <Flex align="center" gap="2">
            <Button
              size="1"
              color="gray"
              variant="outline"
              onClick={() => setViewMode("edit")}
            >
              Edit <Pencil1Icon />
            </Button>

            <AlertDialog.Root>
              <AlertDialog.Trigger>
                <Button size="1" color="tomato">
                  Delete <TrashIcon />
                </Button>
              </AlertDialog.Trigger>
              <AlertDialog.Content style={{ maxWidth: 450 }}>
                <AlertDialog.Title>Delete Meta field</AlertDialog.Title>
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
                      color="tomato"
                      onClick={async () => {
                        const isSuccess = await removeMetaField(metafield.id);
                        if (isSuccess) {
                          toast.success("success! [metafield-remove]");
                        } else {
                          toast.error("error! [metafield-remove]");
                        }
                      }}
                    >
                      Delete <TrashIcon />
                    </Button>
                  </AlertDialog.Action>
                </Flex>
              </AlertDialog.Content>
            </AlertDialog.Root>
          </Flex>
        </Flex>
      </Flex>
      <Flex
        style={{ fontSize: "14px", paddingTop: "10px", opacity: 0.6 }}
        gap="2"
      >
        {metafield.required ? (
          <Flex align="center" gap="1">
            <CheckIcon /> Required
          </Flex>
        ) : null}
        {metafield.visible_registration ? (
          <Flex align="center" gap="1">
            <CheckIcon /> Register
          </Flex>
        ) : null}
        {metafield.visible_profile ? (
          <Flex align="center" gap="1">
            <CheckIcon /> Profile
          </Flex>
        ) : null}
      </Flex>
    </>
  );
};
