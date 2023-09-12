"use client";

import { forwardRef } from "react";
import { TextField } from "@radix-ui/themes";
import type { TextFieldInputProps } from "@radix-ui/themes/dist/cjs/components/text-field";
import { SettingSectionShell } from "./SettingSectionShell";

type STextFieldProps = {
  title: string;
  description?: string;
  placeholder?: string;
  separator?: boolean;
  inputActionSlot?: React.ReactNode;
} & TextFieldInputProps;

export const STextField = forwardRef<HTMLInputElement, STextFieldProps>(
  (
    {
      title,
      description,
      placeholder,
      separator,
      inputActionSlot,
      ...inputProps
    },
    ref
  ) => {
    return (
      <SettingSectionShell
        title={title}
        description={description}
        separator={separator}
      >
        <TextField.Root>
          <TextField.Input
            radius="large"
            size="3"
            placeholder={placeholder}
            ref={ref}
            {...inputProps}
          />
          {inputActionSlot ? (
            <TextField.Slot>{inputActionSlot}</TextField.Slot>
          ) : null}
        </TextField.Root>
      </SettingSectionShell>
    );
  }
);
