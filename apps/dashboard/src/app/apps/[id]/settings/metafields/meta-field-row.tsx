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
  Code,
} from "@radix-ui/themes";
import {
  CheckIcon,
  CopyIcon,
  EyeClosedIcon,
  EyeOpenIcon,
  Pencil1Icon,
  TrashIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import { useState, useEffect } from "react";
import { Metafield } from "@/types";
import { useForm, SubmitHandler, Controller } from "react-hook-form";
import { Toaster, toast } from "sonner";

type Inputs = {
  name: string;
  type: string;
  on_register: boolean;
  on_profile: boolean;
};

type MetaFieldRowProps = {
  metafield?: Metafield;
  removeMetaFieldByFieldName?: (field_name: string) => void;
  defaultViewModeEdit?: boolean;
  variant?: "surface" | "ghost";
  onFormSubmit?: (metafield: Metafield) => void;
};
export const MetaFieldRow = ({
  metafield,
  removeMetaFieldByFieldName,
  defaultViewModeEdit,
  onFormSubmit,
  variant = "surface",
}: MetaFieldRowProps) => {
  const [viewMode, setViewMode] = useState<"display" | "edit">(
    defaultViewModeEdit ? "edit" : "display"
  );
  const minDefaultValues = {
    on_register: true,
    on_profile: true,
    type: "string",
  }
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<IFormInputs>({
    defaultValues: metafield ? metafield : minDefaultValues,
  });

  useEffect(() => {
    if (errors.name) {
      toast.error("Name is required");
    }
  }, [errors.name]);

  const onSubmit: SubmitHandler<Inputs> = (data) => {
    onFormSubmit?.({
      name: data.name,
      type: data.type,
      field_name: data.name.toLowerCase().replace(" ", "_"),
      visible_profile: data.on_profile,
      visible_registration: data.on_register,
    });
  };

  const DisplayView = () => (
    <>
      {metafield ? (
        <>
          <Flex direction="column" gap="5">
            <Flex align="center" justify="between">
              <Flex align="center" gap="2">
                <Text size="3">{metafield.name}</Text>
                <Code variant="soft" color="lime" size="1">
                  {metafield.type}
                </Code>
              </Flex>
              <Flex align="center" gap="2">
                <Button size="1" color="gray" variant="outline" onClick={() => setViewMode('edit')}>
                  Edit <Pencil1Icon />
                </Button>
                <Button
                  size="1"
                  color="tomato"
                  onClick={() =>
                    removeMetaFieldByFieldName?.(metafield.field_name)
                  }
                >
                  Delete <TrashIcon />
                </Button>
              </Flex>
            </Flex>
          </Flex>
          <Flex
            style={{ fontSize: "14px", paddingTop: "10px", opacity: 0.6 }}
            gap="2"
          >
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
      ) : null}
    </>
  );

  const EditView = () => (
    <form onSubmit={handleSubmit(onSubmit)}>
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
          name="type"
          control={control}
          rules={{ required: true }}
          render={({ field, fieldState }) => (
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
          Add <PlusIcon />
        </Button>
      </Flex>
      <Flex gap="6">
        <Flex align="center" gap="2">
          <Controller
            name="on_register"
            control={control}
            rules={{ required: false }}
            render={({ field, fieldState }) => (
              <Checkbox
                id="on_register"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <label htmlFor="on_register">Registration</label>
        </Flex>
        <Flex align="center" gap="2">
          <Controller
            name="on_profile"
            control={control}
            rules={{ required: false }}
            render={({ field, fieldState }) => (
              <Checkbox
                id="on_profile"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <label htmlFor="on_profile">Profile</label>
        </Flex>
      </Flex>
    </form>
  );

  return (
    <Card variant={variant} size="2">
      {viewMode === "display" ? (
        <DisplayView />
      ) : (
        <>
          <EditView />
          <Toaster />
        </>
      )}
    </Card>
  );
};
