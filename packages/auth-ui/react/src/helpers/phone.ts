import { PhoneNumberUtil, PhoneNumberFormat } from "google-libphonenumber";
import { TFunction } from "i18next";
const phoneUtil = PhoneNumberUtil.getInstance();

export const cleanPhoneFormat = (input: string) => {
  return input.replace(/[\s()+-]/g, "");
};

export const isMaybePhoneNumber = (phone: string) => {
  const phoneRegex = /^\+?[\d\s()-]*$/;
  return phone && phoneRegex.test(phone.replace(/\s+/g, ""));
};

export const isValidPhoneNumber = (phone: string, t: TFunction) => {
  if (!phone || phone === "") {
    return t("signInOrUp.phoneValid");
  }
  const _phone = phone.startsWith("+") ? phone : `+${phone}`;
  try {
    if (phoneUtil.isValidNumber(phoneUtil.parseAndKeepRawInput(_phone))) {
      return true;
    } else {
      return t("signInOrUp.phoneValid");
    }
  } catch (error) {
    return t("signInOrUp.phoneValid");
  }
};

export const getISO2CountryCode = (phone: string) => {
  const _phone = phone.startsWith("+") ? phone : `+${phone}`;
  return phoneUtil
    .getRegionCodeForNumber(phoneUtil.parseAndKeepRawInput(_phone))
    ?.toLowerCase();
};

export const formatNational = (phone: string) => {
  const _phone = phone.startsWith("+") ? phone : `+${phone}`;
  const phoneNumber = phoneUtil.parseAndKeepRawInput(
    _phone,
    getISO2CountryCode(_phone)
  );
  return phoneUtil.format(phoneNumber, PhoneNumberFormat.NATIONAL);
};
