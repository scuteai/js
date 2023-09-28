import { Webauthn, type WebauthnProps } from "@scute/ui-react";
import { SCUTE_PREFIX } from "./utils/constants";
import { createElement } from "./utils/element";

export const WEBAUTHN_ELEMENT_NAME = `${SCUTE_PREFIX}webauthn` as const;

export type { WebauthnProps };
export default createElement(Webauthn, WEBAUTHN_ELEMENT_NAME);
