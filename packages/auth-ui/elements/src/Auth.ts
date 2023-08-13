import { Auth, type AuthProps } from "@scute/ui-react";
import { SCUTE_PREFIX } from "./utils/constants";
import { createElement } from "./utils/element";

export const AUTH_ELEMENT_NAME = `${SCUTE_PREFIX}auth` as const;

export type { AuthProps };
export default createElement(Auth, AUTH_ELEMENT_NAME);
