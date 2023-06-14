import { styled, Text, Flex } from "@scute/ui";
import { ScuteApp } from "../../types";
import Link from "next/link";

type ApplicationCardProps = {
  app: ScuteApp;
  children?: JSX.Element;
};

export const AppCard = ({ app, children }: ApplicationCardProps) => {
  return (
    <Link style={{ display: "block" }} href={`/apps/${app.uid}/`}>
      <Holder>
        <AppIcon />
        <Flex css={{ fd: "column" }}>
          <Text>{app.name}</Text>
          <Text size="1">{app.url}</Text>
        </Flex>
      </Holder>
    </Link>
  );
};




export const AppIcon = styled("div", {
  width: "46px",
  height: "46px",
  borderRadius: "$3",
  bc: "rgba(220, 194, 249, 1.000)",
});
const Holder = styled("button", {
  all: "unset",
  boxSizing: "border-box",
  userSelect: "none",
  "&::before": {
    boxSizing: "border-box",
  },
  "&::after": {
    boxSizing: "border-box",
  },
  display: "flex",
  width: "100%",
  height: "180px",
  borderRadius: "$3",
  p: "$5",
  fd: "column",
  jc: "space-between",
  cursor: "pointer",
  transition: "all ease .3s",
  boxShadow: "0px 0px 0px 1px $colors$gray5, 0px 2px 30px rgba(0,0,0,0.005)",
  "&:hover": {
    boxShadow:
      "0px 0px 0px 1px $colors$gray8, 0px 2px 30px rgba(0,0,0,0.015), 0px 10px 15px -3px rgba(0,0,0,0.1) ",
  },
});
