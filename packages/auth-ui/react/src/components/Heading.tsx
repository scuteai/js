import React from "react";
import { Text } from "./Text";
import type { VariantProps, CSS } from "../stitches.config";
import merge from "lodash.merge";

const DEFAULT_TAG = "h1";

type TextSizeVariants = Pick<VariantProps<typeof Text>, "size">;
type HeadingSizeVariants = "1" | "2" | "3" | "4";
type HeadingVariants = { size?: HeadingSizeVariants } & Omit<
  VariantProps<typeof Text>,
  "size"
>;
type HeadingProps = React.ComponentProps<typeof DEFAULT_TAG> &
  HeadingVariants & { css?: CSS; as?: any };

// eslint-disable-next-line react/display-name
export const Heading = React.forwardRef<
  React.ElementRef<typeof DEFAULT_TAG>,
  HeadingProps
>((props, forwardedRef) => {
  // '2' here is the default heading size variant
  const { size = "1", ...textProps } = props;
  // This is the mapping of Heading Variants to Text variants
  const textSize: Record<HeadingSizeVariants, TextSizeVariants["size"]> = {
    1: { "@initial": "6", "@bp2": "5" },
    2: { "@initial": "5", "@bp2": "4" },
    3: { "@initial": "4", "@bp2": "3" },
    4: { "@initial": "3", "@bp2": "2" },
  };

  // This is the mapping of Heading Variants to Text css
  const textCss: Record<HeadingSizeVariants, CSS> = {
    1: { fontWeight: 500, lineHeight: "20px", "@bp2": { lineHeight: "23px" } },
    2: { fontWeight: 500, lineHeight: "25px", "@bp2": { lineHeight: "30px" } },
    3: { fontWeight: 500, lineHeight: "33px", "@bp2": { lineHeight: "41px" } },
    4: {
      mb: "$5",
      fontSize: "$8",
      fontWeight: 500,
      lineHeight: "55px",
      "@bp2": { lineHeight: "60px" },
    },
  };

  return (
    <Text
      as={DEFAULT_TAG}
      {...textProps}
      ref={forwardedRef}
      size={textSize[size]}
      css={{
        mb: "$1 !important",
        color: "$cardHeadingText",
        fontVariantNumeric: "proportional-nums",
        ...merge(textCss[size], props.css),
        "@container queryContainer (min-width: 950px)": {
          mb: "$1",
        },
        "@container queryContainer (max-width: 600px)": {
          mb: "$1",
          fontSize: "$6 !important",
          lineHeight: "35px",
          mb: "$3",
        },
      }}
    />
  );
});
