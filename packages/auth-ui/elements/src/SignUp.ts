import { SignUp, type SignUpProps } from "@scute/ui-react";
import { SCUTE_PREFIX } from "./utils/constants";
import { createElement } from "./utils/element";

export const SIGN_UP_ELEMENT_NAME = `${SCUTE_PREFIX}signup` as const;

export type { SignUpProps };
export default createElement(SignUp, SIGN_UP_ELEMENT_NAME);
