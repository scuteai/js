import { config } from "@scute/ui-shared";
export * from "@scute/ui-shared";

import { createStitches } from "@stitches/react";
// TODO
export const { styled } = createStitches(config as any);