import { UseFormRegisterReturn } from "react-hook-form";
import { styled } from "../stitches.config";
import { TextField } from "./Textfield";
import "react-international-phone/style.css";

import { CountrySelector, usePhoneInput } from "react-international-phone";
import { useEffect, useState } from "react";
import {
  isMaybePhoneNumber,
  cleanPhoneFormat,
  isValidPhoneNumber,
} from "../helpers/phone";
import { ScuteIdentifierType } from "@scute/core";
import { Text } from "./Text";
import { TFunction } from "i18next";
import { isValidEmail } from "../helpers/isValidEmail";

type FloatingLabelTextFieldProps = {
  domId: string;
  label: string;
  fieldType: string;
  size?: number;
  autoCapitalize?: string;
  autoCorrect?: string;
  autoComplete?: string;
  state?: "invalid" | "valid";
  registerFormAttr?: UseFormRegisterReturn<string>;
};

type FloatingLabelIdFieldProps = FloatingLabelTextFieldProps & {
  allowedIdentifiers: ScuteIdentifierType[];
  onChange: (identifier: string) => void;
  isDirty: boolean;
  t: TFunction;
  error: boolean | string;
  setError: (error: boolean | string) => void;
  identifier: string;
  setIdentifier: (identifier: string) => void;
};

const Container = styled("div", {
  position: "relative",
  [`& ${TextField}`]: {
    fontSize: "$5",
  },
  [`& ${TextField}::placeholder`]: {
    color: "transparent",
  },
  "& label": {
    fontSize: "20px",
    lineHeight: "30px",
    fontWeight: "500",
    px: "$2",
    position: "absolute",
    left: "$3",
    top: "18px",
    pointerEvents: "none",
    transformOrigin: "left center",
    transition: "all 150ms",
    borderRadius: "$4",
    color: "$inputText",
    "@container queryContainer (max-width: 470px)": {
      px: "$1",
      top: "13px",
      fontSize: "$3 !important",
      lineHeight: "$sizes$5",
    },
  },
  [`& ${TextField}:focus + label, & ${TextField}:not(:placeholder-shown) + label`]:
    {
      background: "$inputBg",
      transform: "translateY(-110%) scale(0.85)",
      "@container queryContainer (max-width: 470px)": {
        transform: "translateY(-105%) scale(0.85)",
      },
    },
});

export const FloatingLabelTextField = ({
  domId,
  label,
  fieldType,
  size = 2,
  autoCapitalize,
  autoCorrect,
  autoComplete,
  state,
  registerFormAttr,
}: FloatingLabelTextFieldProps) => {
  return (
    <Container>
      <TextField
        id={domId}
        type={fieldType}
        placeholder="&nbsp;"
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        autoComplete={autoComplete}
        state={state}
        {...registerFormAttr}
        size={size}
      />
      <label htmlFor={domId}>{label}</label>
    </Container>
  );
};

export const FloatingLabelIdField = ({
  domId,
  label,
  fieldType = "text",
  size = 2,
  autoCapitalize = "none",
  autoCorrect = "off",
  allowedIdentifiers,
  onChange,
  isDirty,
  t,
  error,
  setError,
  identifier,
  setIdentifier,
}: FloatingLabelIdFieldProps) => {
  const [idState, setIdState] = useState(
    allowedIdentifiers.includes("email") ? "email" : "phone"
  );

  const phoneOnly =
    allowedIdentifiers.length === 1 && allowedIdentifiers[0] === "phone";

  const { inputValue, country, setCountry, handlePhoneValueChange, inputRef } =
    usePhoneInput({
      value: isValidPhoneNumber(identifier, t)
        ? identifier
        : !phoneOnly
        ? "+000"
        : "",
      onChange: ({ phone }) => {
        onChange(phone);
        setIdentifier(phone);
        const isValidPhone = isValidPhoneNumber(phone, t);
        if (isValidPhone !== true) {
          setError(isValidPhone);
        } else {
          setError(false);
        }
      },
    });

  useEffect(() => {
    identifierChangeHandler(identifier);
  }, [identifier]);

  const identifierChangeHandler = (
    identifier: string,
    e?: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (
      allowedIdentifiers.includes("phone") &&
      isMaybePhoneNumber(identifier)
    ) {
      if (idState === "email") {
        setIdentifier(identifier);
        onChange(identifier);
      }
      setIdState("phone");
    } else if (allowedIdentifiers.includes("email")) {
      if (idState === "phone") {
        const id = cleanPhoneFormat(identifier);
        if (e) {
          handlePhoneValueChange(e);
        }
        setIdentifier(id);
        onChange(id);
      } else {
        setIdentifier(identifier);
        onChange(identifier);
      }

      if (identifier === "") {
        setError(t("signInOrUp.identifierRequired"));
      } else if (!isValidEmail(identifier)) {
        setError(t("signInOrUp.emailValid"));
      } else {
        setError(false);
      }

      setIdState("email");
    }
  };

  return (
    <Container>
      {idState === "phone" && (
        <CountrySelector
          selectedCountry={country.iso2}
          onSelect={(data) => setCountry(data.iso2)}
          style={{
            position: "absolute",
            top: "14px",
            left: "10px",
            border: "none",
          }}
          buttonStyle={{
            border: "none",
            backgroundColor: "transparent",
          }}
        />
      )}
      <TextField
        id={domId}
        type={fieldType}
        placeholder="&nbsp;"
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        autoComplete={idState === "phone" ? "tel" : "email"}
        state={error && isDirty ? "invalid" : "valid"}
        size={size}
        value={idState === "phone" ? inputValue : identifier}
        ref={inputRef}
        onChange={(e) => {
          if (
            allowedIdentifiers.includes("phone") &&
            isMaybePhoneNumber(e.target.value)
          ) {
            if (idState === "email") {
              setIdentifier(e.target.value);
              onChange(e.target.value);
            }
            setIdState("phone");
            handlePhoneValueChange(e);
          } else if (allowedIdentifiers.includes("email")) {
            if (idState === "phone") {
              const id = cleanPhoneFormat(e.target.value);
              handlePhoneValueChange(e);
              setIdentifier(id);
              onChange(id);
            } else {
              setIdentifier(e.target.value);
              onChange(e.target.value);
            }

            if (e.target.value === "") {
              setError(t("signInOrUp.identifierRequired"));
            } else if (!isValidEmail(e.target.value)) {
              setError(t("signInOrUp.emailValid"));
            } else {
              setError(false);
            }

            setIdState("email");
          }
        }}
        css={
          idState === "phone"
            ? {
                paddingLeft: "60px",
              }
            : {}
        }
      />
      <label htmlFor={domId}>{label}</label>
      {error && isDirty ? (
        <Text size="1" css={{ color: "$errorColor", pt: "$2" }}>
          {error}
        </Text>
      ) : null}
    </Container>
  );
};
