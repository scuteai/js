import { useState } from "react";

//@ts-ignore
import _PhoneFormatter from "react-headless-phone-input/lazy";
import type PhoneFormatterType from "react-headless-phone-input/dist/lazy";
import { Group } from "./Layout";
import { Label } from "./Label";
import { TextField } from "./Textfield";
import { Text } from "./Text";
import { Flex } from "./Flex";
// fix types
const PhoneFormatter = _PhoneFormatter as typeof PhoneFormatterType;

const PhoneInput = ({ onChange }: { onChange?: (val: string) => void }) => {
  const [number, setNumber] = useState("");

  return (
    <PhoneFormatter
      defaultCountry="US"
      value={number}
      onChange={(val) => {
        setNumber(val as any);
        onChange?.(val as any);
      }}
    >
      {({ country, impossible, onBlur, onInputChange, inputValue }) => {
        return (
          <Group css={{ width: "100%", my: "$2" }}>
            <Flex>
              <Flex css={{ marginRight: "$2", marginTop: "-3px" }}>
                {country ? (
                  <img
                    height={24}
                    width={24}
                    src={`https://cdn.jsdelivr.net/gh/madebybowtie/FlagKit@2.2/Assets/SVG/${country}.svg`}
                  />
                ) : (
                  <Text
                    css={{
                      fontSize: "30px",
                      marginTop: "2px",
                    }}
                  >
                    ✆
                  </Text>
                )}
              </Flex>
              <Label>Phone</Label>
            </Flex>

            <TextField
              placeholder="Phone"
              size="2"
              autoComplete="tel"
              state={impossible ? "invalid" : "valid"}
              value={inputValue}
              onBlur={() => onBlur()}
              onChange={(e) => onInputChange(e.target.value)}
            />
            {impossible && (
              <Text size="1" css={{ color: "$errorColor", pt: "$2" }}>
                Invalid number
              </Text>
            )}
          </Group>
        );
      }}
    </PhoneFormatter>
  );
};

export default PhoneInput;
