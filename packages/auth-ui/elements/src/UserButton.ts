import { UserButton, type UserButtonProps } from "@scute/ui-react";
import { SCUTE_PREFIX } from "./utils/constants";
import { createElement } from "./utils/element";

export const USER_BUTTON_ELEMENT_NAME = `${SCUTE_PREFIX}userButton` as const;

export type { UserButtonProps };
export default createElement(UserButton, USER_BUTTON_ELEMENT_NAME);
