import i18n, { TOptions } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import { ScuteError } from "@scute/core";

export const initI18n = async (language?: string) => {
  return await i18n.use(initReactI18next).init({
    lng: language || "en",
    resources: {
      en: { translation: en },
    },
  });
};

export const translate = (key: string, options?: TOptions) =>
  i18n.t(key, options);

export const translateError = (error: ScuteError) => {
  const slug = error.slug;
  if (!slug) return error.message;
  return i18n.t(`scuteError.${slug}`);
};
