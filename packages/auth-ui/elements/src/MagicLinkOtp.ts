import { MagicLinkOtp, type MagicLinkOtpProps } from "@scute/ui-react";
import { SCUTE_PREFIX } from "./utils/constants";
import { createElement } from "./utils/element";

export const MAGIC_LINK_OTP_ELEMENT_NAME =
  `${SCUTE_PREFIX}magiclinkotp` as const;

export type { MagicLinkOtpProps };
export default createElement(MagicLinkOtp, MAGIC_LINK_OTP_ELEMENT_NAME);