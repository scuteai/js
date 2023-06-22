import {
  Grid,
  Flex,
  Status,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  IconButton,
  Badge,
  styled,
  Avatar,
} from "@scute/ui";

import { DotsHorizontalIcon, TrashIcon } from "@radix-ui/react-icons";
import Link from "next/link";

// TODO
import type { ScuteUser } from "@scute/core";

type UserRowProps = {
  user: ScuteUser;
  teamMember?: boolean;
};

const UserRowPopover = () => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild={true}>
        <IconButton>
          <DotsHorizontalIcon />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end">
        <Link href="/apps/s3414dfa/users/4315">
          <DropdownMenuItem>View details</DropdownMenuItem>
        </Link>
        <DropdownMenuItem>Deactivate</DropdownMenuItem>
        <DropdownMenuItem>
          Delete <TrashIcon />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
export const UserRow = ({ user, teamMember }: UserRowProps) => {
  return (
    <RowHolder columns={5}>
      <Link href="/apps/s3414dfa/users/4315">
        <Flex css={{ gap: "$2", ai: "center", color: "$gray12" }}>
          <Avatar fallback="UK" size="2" shape="square" />
          {user.username}
        </Flex>
      </Link>
      <Flex>
        <Badge
          variant="cyan"
          css={{ fontFamily: "$mono", userSelect: "all" }}
          size="0"
        >
          {user.id}
        </Badge>
      </Flex>
      <Flex>4 days ago</Flex>
      <Flex>2 hours ago</Flex>
      <Flex css={{ ai: "center", gap: "$1", jc: "space-between" }}>
        <Badge variant="green" css={{ gap: "$1", ai: "center" }} size="0">
          <Status variant="green" size="1" />
          Active
        </Badge>
        <UserRowPopover />
      </Flex>
    </RowHolder>
  );
};

export const RowHolder = styled(Grid, {
  py: "$2",
  px: "$1",
  borderRadius: "$2",
  fontSize: "$2",
  ai: "center",
  borderBottom: "1px solid $colors$gray3",
  "&:last-child": {
    borderBottom: "transparent",
  },
  "&:hover": {
    background: "$purple3",
  },
});
