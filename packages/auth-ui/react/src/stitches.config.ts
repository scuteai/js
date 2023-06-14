import { config } from "@scute/auth-ui-shared";
export * from "@scute/auth-ui-shared";

import { createStitches } from "@stitches/react";
// TODO
export const { styled } = createStitches(config as any);