import {
  Heading,
  Tabs,
  TextArea,
  Popover,
  Flex,
  Text,
  Inset,
  TextField,
  DropdownMenu,
  Button,
} from "@radix-ui/themes";
import { CaretDownIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { ChromePicker } from "react-color";





export const FontPicker = () => {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button variant="outline">
          Select a font
          <CaretDownIcon />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.Item>Helvetica</DropdownMenu.Item>
        <DropdownMenu.Item>Georgia</DropdownMenu.Item>
        <DropdownMenu.Item>Menlo</DropdownMenu.Item>
        <DropdownMenu.Item>Times</DropdownMenu.Item>
        <DropdownMenu.Item>Inter</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
};


interface ColorPickerProps {
  color: string;
  onChange?: (color: string) => void;
}

export const ColorPickerPop = ({color='#ff0000', onChange} : ColorPickerProps ) => {
  return (
    <Popover.Root>
      <Popover.Trigger>
        <Button variant="outline">
          <Flex align="center" style={{ gap: "6px", width: "100px" }}>
            <Flex
              style={{
                width: "18px",
                height: "18px",
                background: color,
                borderRadius: "4px",
              }}
            ></Flex>
            <Text style={{ flexGrow: "1" }}>{color}</Text>
          </Flex>
        </Button>
      </Popover.Trigger>
      <Popover.Content size="1" style={{ padding: "4px" }}>
        <Flex>
          <ChromePicker
            color={color}
            onChange={(color) => onChange?.(color.hex)}
          />
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
};
