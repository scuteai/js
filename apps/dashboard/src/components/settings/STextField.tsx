"use client";

import { TextField } from "@radix-ui/themes";
import { SettingSectionShell } from "./SettingSectionShell";
import { RegisterOptions, UseFormRegisterReturn } from "react-hook-form";

type STextFieldProps = {
  title: string;
  description?: string;
  placeholder?: string;
  value?: string;
  separator?: boolean;
  disabled?: boolean;
  inputActionSlot?: React.ReactNode;
  inputName?: string;
  register?: UseFormRegisterReturn;
  rules?: RegisterOptions;
};

export const STextField = ({
  title,
  description,
  placeholder,
  value,
  separator,
  disabled,
  inputActionSlot,
  register,
}: STextFieldProps) => {
  return (
    <SettingSectionShell
      title={title}
      description={description}
      separator={separator}
    >
      <TextField.Root>
        <TextField.Input
          value={value}
          disabled={disabled}
          radius="large"
          size="3"
          placeholder={placeholder}
          {...register}
        />
        {inputActionSlot ? (
          <TextField.Slot>{inputActionSlot}</TextField.Slot>
        ) : null}
      </TextField.Root>
    </SettingSectionShell>
  );
};
