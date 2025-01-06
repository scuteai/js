import {
  type ScuteMagicLinkIdResponse,
  type ScuteTokenPayload,
  decodeMagicLinkToken,
  SCUTE_MAGIC_PARAM,
  SCUTE_SKIP_PARAM,
  type ScuteError,
  getMeaningfulError,
} from "@scute/core";

import { useTranslation } from "react-i18next";

import useEffectOnce from "../helpers/useEffectOnce";

import {
  Button,
  Flex,
  Group,
  Heading,
  Inner,
  Label,
  Text,
  LargeSpinner,
  FloatingLabelTextField,
  QueryContainer,
  ResponsiveContainer,
  ResponsiveLeft,
  ResponsiveRight,
} from "../components";

import { SubmitHandler, useForm, type FieldValues } from "react-hook-form";
import { VIEWS } from "@scute/ui-shared";
import { translateError } from "../helpers/i18n/service";
import { SignInOrUpProps, useSignInOrUpFormHelpers } from "./SignInOrUp";
import { FloatingLabelIdField } from "../components/FloatingLabelTextField";
import { useState } from "react";

export interface RegisterFormProps extends SignInOrUpProps {
  shouldSkipRegisterForm: boolean;
  backToLogin: () => void;
}

export const RegisterForm = ({
  scuteClient,
  identifier,
  setAuthView,
  appData,
  mode,
  shouldSkipRegisterForm,
  backToLogin,
  setIsFatalError,
  getMagicLinkIdCallback,
  getAuthPayloadCallback,
}: RegisterFormProps) => {
  const {
    register,
    setError,
    clearErrors,
    handleSubmit,
    setValue,
    formState: { errors, isDirty, isValid, isSubmitted },
  } = useForm();
  const [idError, setIdError] = useState<string | boolean>(false);
  const { t } = useTranslation();

  const {
    allowedIdentifiers,
    maybeNeededIdentifierType,
    maybeNeededIdentifierLabel,
  } = useSignInOrUpFormHelpers(identifier, appData, mode);

  useEffectOnce(() => {
    if (shouldSkipRegisterForm) {
      handleContinue({});
    }
  });

  const isError = Object.keys(errors).length !== 0;

  const handleContinue: SubmitHandler<FieldValues> = async (values) => {
    let data: ScuteMagicLinkIdResponse | ScuteTokenPayload | null = null;
    let error: ScuteError | null = null;
    console.log({ idError, errors });
    if (idError && typeof idError === "string") {
      console.log("idError", idError);
      return;
    }

    if (mode !== "confirm_invite") {
      ({ data, error } = await scuteClient.signUp(identifier, {
        userMeta: values,
      }));
    } else {
      const magicToken = new URL(window.location.href).searchParams.get(
        SCUTE_MAGIC_PARAM
      )!;
      const magicPayload = decodeMagicLinkToken(magicToken)!;

      ({ data, error } = await scuteClient.confirmInvite(magicToken, values));
      if (data) {
        const isWebauthnAvailable =
          scuteClient.isWebauthnSupported() &&
          magicPayload.webauthnEnabled !== false;

        if (isWebauthnAvailable) {
          setAuthView(VIEWS.WEBAUTHN_REGISTER);
        } else {
          // login
          const { error: signInError } =
            await scuteClient.signInWithTokenPayload(data);
          error = signInError;
        }

        getAuthPayloadCallback?.(data);
      }
    }

    const url = new URL(window.location.href);
    url.searchParams.delete(SCUTE_MAGIC_PARAM);
    url.searchParams.delete(SCUTE_SKIP_PARAM);
    window.history.replaceState(window.history.state, "", url.toString());

    if (error) {
      const { isFatal } = getMeaningfulError(error);
      setIsFatalError?.(isFatal);
      setError("root.serverError", {
        type: String(error.code),
        message: translateError(error),
      });
      return;
    }

    if (data && "magic_link" in data) {
      const magicLinkId = data.magic_link.id;
      getMagicLinkIdCallback?.(magicLinkId);
    }
  };

  if (errors.root?.serverError.message) {
    return (
      <>
        <Text
          size="2"
          css={{ color: "$errorColor", mb: "$1", textAlign: "center" }}
        >
          {errors.root?.serverError.message}
        </Text>
        <Flex css={{ jc: "center", mt: "2rem" }}>
          <Button
            variant="alt"
            size="2"
            onClick={() => {
              setIdError(false);
              backToLogin();
            }}
          >
            {t("registerForm.backToLogin")}
          </Button>
        </Flex>
      </>
    );
  } else if (shouldSkipRegisterForm) {
    return <LargeSpinner spinnerColor="green" />;
  }

  return (
    <form
      onSubmit={handleSubmit(handleContinue)}
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
                {t("general.signInOrUp")}
              </Heading>
              <Text size="2" css={{ mb: "$4" }}>
                {t("registerForm.needInfo")}
              </Text>
              {isError || (idError && isSubmitted) ? (
                <Text size="1" css={{ color: "$errorColor", pt: "$2" }}>
                  {t("general.correctErrors")}
                </Text>
              ) : null}
            </Inner>
          </ResponsiveLeft>
          <ResponsiveRight>
            <Inner>
              <div>
                {allowedIdentifiers.length > 1 ? (
                  <>
                    <Group>
                      <FloatingLabelIdField
                        domId="email_field__floating_label"
                        label={maybeNeededIdentifierLabel}
                        autoCorrect="off"
                        autoCapitalize="none"
                        autoComplete={
                          maybeNeededIdentifierType === "email"
                            ? "email"
                            : "tel"
                        }
                        fieldType="text"
                        allowedIdentifiers={[maybeNeededIdentifierType]}
                        onChange={(value) =>
                          setValue(maybeNeededIdentifierType, value)
                        }
                        isDirty={isSubmitted}
                        t={t}
                        error={idError}
                        setError={(error) => {
                          setIdError(error);
                        }}
                        identifier={identifier}
                        setIdentifier={(value) =>
                          setValue(maybeNeededIdentifierType, value)
                        }
                      />
                    </Group>
                  </>
                ) : null}
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
