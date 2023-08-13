import type { ScuteIdentifier, ScuteIdentifierType } from "@scute/core";

export const isEmailIdentifier = (identifier: ScuteIdentifier) => {
  return getIdentifierType(identifier) === "email";
};

export const isPhoneIdentifier = (identifier: ScuteIdentifier) => {
  return getIdentifierType(identifier) === "phone";
};

export const getIdentifierType = (
  identifier: ScuteIdentifier
): ScuteIdentifierType => {
  // assuming that the validation happened before
  const isEmailIdentifier = identifier.includes("@");

  return isEmailIdentifier ? "email" : "phone";
};
