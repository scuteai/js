import { UseFormRegisterReturn } from "react-hook-form";
import { styled } from "../stitches.config";
import { TextField } from "./Textfield";

type FloatingLabelTextFieldProps = {
  domId: string;
  label: string;
  fieldType: string;
  size?: number;
  autoCapitalize?: string;
  autoCorrect?: string;
  autoComplete?: string;
  state?: "invalid" | "valid";
  registerFormAttr: UseFormRegisterReturn<string>;
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
    fontSize: "$5",
    fontWeight: "500",
    px: "$2",
    position: "absolute",
    left: "$3",
    top: "18px",
    pointerEvents: "none",
    transformOrigin: "left center",
    transition: "all 150ms",
    borderRadius: "$4",
  },
  [`& ${TextField}:focus + label, & ${TextField}:not(:placeholder-shown) + label`]:
    {
      background: "$inputBg",
      transform: "translateY(-120%) scale(0.85)",
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
