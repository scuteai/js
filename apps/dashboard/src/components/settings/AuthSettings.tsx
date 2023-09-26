"use client";
import type { UpdateAppBodyParams } from "@/api";
import type { ScuteAppData } from "@/types";

import { Controller, useForm } from "react-hook-form";
import {
  Card,
  Checkbox,
  Container,
  Flex,
  Heading,
  Switch,
  Text,
} from "@radix-ui/themes";
import { SettingSectionShell } from "./SettingSectionShell";
import { STextField } from "./STextField";
import { SaveBar } from "../shared/SaveBar";
import { toast } from "sonner";

export type AuthSettingsInputs = NonNullable<UpdateAppBodyParams["auth"]>;

export interface AuthSettingsProps {
  appData: ScuteAppData;
  updateApp: (data: AuthSettingsInputs) => Promise<ScuteAppData | null>;
}

export const AuthSettings = ({ appData, updateApp }: AuthSettingsProps) => {
  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitting, isValid },
  } = useForm<AuthSettingsInputs>({
    defaultValues: appData,
  });

  return (
    <Container size="2">
      {isDirty && (
        <SaveBar
          handleSave={async () => {
            handleSubmit(
              async (values) => {
                // valid
                const updatedAppData = await updateApp(values);
                if (updatedAppData) {
                  appData = updatedAppData;
                  toast.success("success [authsettings]!");
                  reset({}, { keepValues: true });
                }
              },
              () => {
                // invalid
              }
            )();
          }}
          handleDiscard={() => {
            reset(appData);
          }}
        />
      )}
      <Flex direction="column" gap="4">
        {/* General Section */}
        <Card size="3">
          <Flex direction="column" gap="5">
            <Heading color="gray">Authentication</Heading>
            <SettingSectionShell
              title="Public signups"
              description="Allow users to self-register for your application."
              flexRow={true}
              separator
            >
              <Flex>
                <Controller
                  control={control}
                  name="public_signup"
                  render={({ field }) => (
                    <Switch
                      color="lime"
                      {...field}
                      value={undefined}
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </Flex>
            </SettingSectionShell>
            <SettingSectionShell
              title="Profile management"
              description="Allow users to edit their account information, including email address and phone number. Users will always be able to manage their passkeys."
              flexRow={true}
              separator
            >
              <Flex>
                <Controller
                  control={control}
                  name="profile_management"
                  render={({ field }) => (
                    <Switch
                      color="lime"
                      {...field}
                      value={undefined}
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </Flex>
            </SettingSectionShell>

            <SettingSectionShell
              title="Supported identifiers"
              description="Choose how your users will identify themselves on your app."
              flexRow={false}
              separator
            >
              <Flex gap="7">
                <Flex align="center" gap="2">
                  <Checkbox
                    id="checkbox-7"
                    size="1"
                    defaultChecked
                    checked
                    disabled
                  />
                  <label htmlFor="checkbox-7">
                    <Text size="1">
                      Email{" "}
                      <span style={{ color: "var(--lime-11)" }}>
                        * required
                      </span>
                    </Text>
                  </label>
                </Flex>
                <Flex align="center" gap="2">
                  <Checkbox id="checkbox-7" size="1" disabled />
                  <label htmlFor="checkbox-7">
                    <Text size="1">
                      Phone number
                      <span style={{ color: "var(--orange-11)" }}>(soon)</span>
                    </Text>
                  </label>
                </Flex>
              </Flex>
            </SettingSectionShell>
            <SettingSectionShell
              title="Scute Branding"
              description="Add or remove the “Powered by Scute” tag at the bottom of UI elements."
              flexRow={true}
              separator
            >
              <Flex>
                <Controller
                  control={control}
                  name="scute_branding"
                  render={({ field }) => (
                    <Switch
                      color="lime"
                      {...field}
                      value={undefined}
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </Flex>
            </SettingSectionShell>
          </Flex>
        </Card>

        {/* Section session management */}
        <Card size="3">
          <Flex direction="column" gap="5">
            <Heading color="gray">Session management</Heading>
            <STextField
              title="Access token expiration"
              separator
              {...register("access_expiration")}
            />
            <SettingSectionShell
              title="Enable auto refresh"
              description="Use refresh tokens to safely enable long-lived sessions. "
              flexRow={true}
              separator
            >
              <Flex>
                <Controller
                  control={control}
                  name="auto_refresh"
                  render={({ field }) => (
                    <Switch
                      color="lime"
                      {...field}
                      value={undefined}
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </Flex>
            </SettingSectionShell>
            <SettingSectionShell
              title="Disable refresh token in payload"
              description="You should disable refresh token in payload if you want to use httpOnly refresh token (refresh proxy mode) for maximum security."
              flexRow={true}
              separator
            >
              <Flex>
                <Controller
                  control={control}
                  name="refresh_payload"
                  render={({ field }) => {
                    return (
                      <Switch
                        color="lime"
                        {...field}
                        disabled={!watch("auto_refresh")}
                        value={undefined}
                        checked={!field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(!checked);
                        }}
                      />
                    );
                  }}
                />
              </Flex>
            </SettingSectionShell>
            <STextField
              title="Refresh token expiration"
              separator
              {...register("refresh_expiration")}
            />
            <STextField
              title="Magic link duration"
              {...register("magic_link_expiration")}
            />
            <Flex style={{ marginBottom: "10px" }} />
          </Flex>
        </Card>
      </Flex>
    </Container>
  );
};
