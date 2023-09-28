import { Profile, type ProfileProps } from "@scute/ui-react";
import { SCUTE_PREFIX } from "./utils/constants";
import { createElement } from "./utils/element";

export const PROFILE_ELEMENT_NAME = `${SCUTE_PREFIX}profile` as const;

export type { ProfileProps };
export default createElement(Profile, PROFILE_ELEMENT_NAME);