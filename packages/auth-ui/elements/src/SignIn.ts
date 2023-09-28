import { SignIn, type SignInProps } from "@scute/ui-react";
import { SCUTE_PREFIX } from "./utils/constants";
import { createElement } from "./utils/element";

export const SIGN_IN_ELEMENT_NAME = `${SCUTE_PREFIX}signin` as const;

export type { SignInProps };
export default createElement(SignIn, SIGN_IN_ELEMENT_NAME);