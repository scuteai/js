import {
  styled,
  Flex,
  Text,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@scute/ui";
import { CaretDownIcon, PlusCircledIcon } from "@radix-ui/react-icons";
import { ScuteApp } from "@/types";

const AppsPopover = () => {
  return (
    <Popover>
      <PopoverTrigger asChild={true}>
        <AppPopoverButton>
          {/* <AppBadge app={_APP} /> */}
          <CaretDownIcon />
        </AppPopoverButton>
      </PopoverTrigger>
      {/* @ts-ignore */}
      <PopoverContent hideArrow={true}>
        {/* <AppBadge app={_APP} /> */}
        <Flex
          css={{ mt: "$2", borderTop: "1px solid $colors$gray3", pt: "$2" }}
        >
          <Button size="0" css={{ width: "100%" }}>
            <PlusCircledIcon /> Create new app
          </Button>
        </Flex>
      </PopoverContent>
    </Popover>
  );
};

const AppPopoverButton = styled("button", {
  all: "unset",
  display: "flex",
  bc: "$colors$gray2",
  py: "$1",
  borderRadius: "$2",
  px: "$1",
  pr: "$2",
  ai: "center",
  gap: "$2",
  cursor: "pointer",
  "&:hover": {
    background: "$colors$gray3",
  },
});

export const AppBadge = ({ app }: { app: ScuteApp }) => {
  return (
    <Flex css={{ ai: "center", gap: "$2" }}>
      <AppAvatar />
      <Text size="1">{app.name}</Text>
    </Flex>
  );
};
const AppAvatar = styled("div", {
  width: "$4",
  height: "$4",
  borderRadius: "$1",
  bc: "rgba(220, 194, 249, 1.000)",
});
