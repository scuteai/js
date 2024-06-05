import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import { ScuteError } from "@scute/core";

export const initI18n = (language?: string) =>
  i18next.use(initReactI18next).init({
    lng: language || "en",
    resources: {
      en: { translation: en },
    },
  });

export const translateError = (error: ScuteError) => {
  const slug = error.slug;
  if (!slug) return error.message;
  return i18next.t(`scuteError.${slug}`);
};
