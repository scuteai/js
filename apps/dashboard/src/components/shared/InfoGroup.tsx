import { styled } from "@scute/ui";

export const InfoGroup = styled("div", {
  fontSize: "$1",
});
export const InfoGroupTitle = styled("div", {
  fontSize: "$0",
  pb: "$2",
  color: "$gray9",
});
export const InfoGroupContent = styled("div", {
  fontSize: "$2",
  color: "$slate12",
  display: "flex",
  ai: "center",
  gap: "$1",
});

export const TableHeader = styled("div", {
  fontSize: "$1",
  color: "$gray9",
  pb: "$6",
  px: "$1",
});

export const TableContent = styled("div", { display: "flex", fd: "column" });
