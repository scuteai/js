import { useEffect, useState } from "react";
import { RegisterForm, RegisterFormProps } from "./RegisterForm";
import { SignInOrUpProps } from "./SignInOrUp";
import {
  Button,
  FloatingLabelTextField,
  Group,
  Heading,
  Inner,
  Label,
  LargeSpinner,
  QueryContainer,
  ResponsiveContainer,
  ResponsiveLeft,
  ResponsiveRight,
  Text,
} from "../components";
import {
  decodeMagicLinkToken,
  SCUTE_MAGIC_PARAM,
  SCUTE_OAUTH_PKCE_PARAM,
} from "@scute/core";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

interface PkceOtpProps extends SignInOrUpProps {}

export const PkceOtp = ({
  scuteClient,
  appData,
  setIsFatalError,
}: PkceOtpProps) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [shouldSkipRegisterForm] = useState(
    () =>
      appData.allowed_identifiers.length === 1 &&
      appData.user_meta_data_schema.length === 0
  );

  const [magicLinkToken] = useState(() =>
    typeof window !== "undefined" && typeof URLSearchParams !== "undefined"
      ? new URL(window.location.href).searchParams.get(SCUTE_MAGIC_PARAM) ??
        new URL(window.location.href).searchParams.get(SCUTE_OAUTH_PKCE_PARAM)
      : null
  );

  const {
    register,
    clearErrors,
    handleSubmit,
    formState: { errors, isDirty, isValid },
  } = useForm();
  const isError = Object.keys(errors).length !== 0;

  useEffect(() => {
    // check if user needs meta filling

    const checkMetaFields = async () => {
      if (magicLinkToken) {
        if (shouldSkipRegisterForm) {
          await scuteClient.verifyMagicLinkToken(magicLinkToken);
        }
        const decoded = decodeMagicLinkToken(magicLinkToken);
        if (decoded?.uuid) {
          const { data, error } = await scuteClient.getUserMetafieldState(
            decoded!.uuid
          );

          if (error) {
            setIsFatalError!(true);
            return;
          }

          if (!data.meta) {
            setLoading(false);
          } else {
            await scuteClient.verifyMagicLinkToken(magicLinkToken);
          }
        }
      }
    };

    checkMetaFields();
  }, [shouldSkipRegisterForm, magicLinkToken]);

  if (loading) {
    return <LargeSpinner />;
  }

  return (
    <form
      onSubmit={handleSubmit(async (data) => {
        if (magicLinkToken) {
          await scuteClient.verifyMagicLinkToken(magicLinkToken);
          await scuteClient.updateUserMeta(data);
        }
      })}
      onChange={() => {
        clearErrors("root.serverError");
      }}
    >
      <QueryContainer css={{ pt: "0px", pb: "$2" }}>
        <ResponsiveContainer>
          <ResponsiveLeft>
            <Inner
              css={{
                ta: "center",
                "@container queryContainer (min-width: 950px)": {
                  ta: "left",
                },
              }}
            >
              <Heading size="4" css={{ mb: "$2" }}>
                {t("registerForm.title")}
              </Heading>
              <Text size="2" css={{ mb: "$4" }}>
                {t("registerForm.needInfoShort")}
              </Text>
              {isError ? (
                <Text size="1" css={{ color: "$errorColor", pt: "$2" }}>
                  {t("general.correctErrors")}
                </Text>
              ) : null}
            </Inner>
          </ResponsiveLeft>
          <ResponsiveRight>
            <Inner>
              <div>
                {appData.user_meta_data_schema
                  .filter((metadata) => metadata.visible_registration)
                  .map(({ field_name, name, field_type, required }, i) => {
                    if (field_type === "phone") {
                      field_type = "tel" as any;
                    }

                    return (
                      <Group key={field_name} css={i === 0 ? { mt: "0" } : {}}>
                        {field_type === "boolean" ? (
                          <>
                            <Label>{name}</Label>
                            <br />
                            <input
                              type="checkbox"
                              {...register(field_name, {
                                required: required
                                  ? t("general.requiredField")
                                  : undefined,
                              })}
                            />
                          </>
                        ) : (
                          <FloatingLabelTextField
                            domId={`${name}__floating_label`}
                            label={name}
                            fieldType={field_type}
                            state={isError ? "invalid" : "valid"}
                            registerFormAttr={register(field_name, {
                              required: required
                                ? t("general.requiredField")
                                : undefined,
                              valueAsNumber:
                                field_type === "integer" ? true : undefined,
                            })}
                          />
                        )}
                        {errors[field_name] ? (
                          <Text
                            size="1"
                            css={{ color: "$errorColor", pt: "$2" }}
                          >
                            <>{errors[field_name]?.message}</>
                          </Text>
                        ) : null}
                      </Group>
                    );
                  })}
              </div>

              <br />
              <Button size="2" type="submit" disabled={!isDirty && !isValid}>
                <span>{t("general.continue")}</span>
              </Button>
            </Inner>
          </ResponsiveRight>
        </ResponsiveContainer>
      </QueryContainer>
    </form>
  );
};
