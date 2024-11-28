import { useTranslation } from "react-i18next";
import { Button, Heading, Inner, ManualOTPWrapper, Text } from "../components";
import { CommonViewProps } from "./common";
import { isValidEmail } from "../helpers/isValidEmail";
import { useEffect, useState } from "react";
import { ScuteIdentifier } from "@scute/core";
import OTPInput from "react-otp-input";
import { globalCss } from "../stitches.config";
import { textFieldStyles } from "../components/Textfield";
import { ArrowIcon } from "../assets/icons";

const globalStyles = globalCss({
  ".otp-input": {
    ...textFieldStyles,
    fontSize: "1.5rem",
    margin: "1rem 0.3rem 0 0.3rem",
    borderRadius: "$2",
    width: "2.3rem !important",
    height: "3rem",
    "&:nth-child(1)": {
      marginLeft: "0 !important",
    },
    "&:nth-child(6)": {
      marginRight: "0 !important",
    },
  },
});

const VerifyManualOtp = ({
  scuteClient,
  identifier: _identifier,
}: CommonViewProps) => {
  const { t } = useTranslation();
  globalStyles();

  const [source, setSource] = useState<"email" | "phone" | null>(null);
  const [rememberedIdentifier, setRememberedIdentifier] =
    useState<ScuteIdentifier | null>(null);

  const [otp, setOtp] = useState("");

  useEffect(() => {
    const identifier = _identifier || rememberedIdentifier;
    if (identifier) {
      if (isValidEmail(identifier)) {
        setSource("email");
      } else {
        setSource("phone");
      }
    }
  }, [_identifier, rememberedIdentifier]);

  useEffect(() => {
    scuteClient.getRememberedIdentifier().then(setRememberedIdentifier);
  }, [scuteClient]);

  return (
    <Inner>
      <ManualOTPWrapper>
        <Heading size="4">{t("verifyOTP.newDeviceTitle")}</Heading>
        <Text size="2" css={{ mb: "$4" }}>
          {t("verifyOTP.manualOtpBody", { source })}
        </Text>
        <div>
          <OTPInput
            value={otp}
            onChange={setOtp}
            numInputs={6}
            inputStyle="otp-input"
            renderInput={(props) => <input {...props} />}
          />
        </div>
        <Button
          size="1"
          type="submit"
          css={{ mt: "$7", width: "100%", maxWidth: "270px" }}
        >
          <span>{t("verifyOTP.verify")}</span>
          <ArrowIcon className="right" />
        </Button>
      </ManualOTPWrapper>
    </Inner>
  );
};

export default VerifyManualOtp;
