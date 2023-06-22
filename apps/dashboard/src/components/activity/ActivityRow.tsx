import {
  Flex,
  Avatar,
  Badge,
  styled,
  AccordionContent,
  AccordionItem,
} from "@scute/ui";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { RowHolder } from "@/components/users/UserRow";
import Link from "next/link";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import {
  InfoGroup,
  InfoGroupContent,
  InfoGroupTitle,
} from "@/components/shared/InfoGroup";

// TODO
import type { ScuteActivity } from "@scute/core";

const StyledIcon = styled("div", {
  transition: "transform .2s ease",
});

const StyledTrigger = styled(AccordionPrimitive.Trigger, {
  all: "unset",
  boxSizing: "border-box",
  userSelect: "none",
  transition: "transform .2s ease",
  borderRadius: "$3",
  "&::before": {
    boxSizing: "border-box",
  },
  "&::after": {
    boxSizing: "border-box",
  },
  cursor: "pointer",
  color: "$hiContrast",
  width: "100%",
  "@hover": {
    "&:hover": {
      backgroundColor: "$slate2",
    },
  },

  "&:focus": {
    outline: "none",
    // boxShadow: 'inset 0 0 0 1px $colors$slate8, 0 0 0 1px $colors$slate8',
  },

  '&[data-state="open"]': {
    background: "$cyan4",
    [`& ${StyledIcon}`]: {
      transform: "rotate(-180deg)",
    },
  },
});

type ActivityRowProps = {
  activity: ScuteActivity;
  value: string;
};

export const ActivityRow = ({ value, activity }: ActivityRowProps) => {
  return (
    <AccordionItem value={value}>
      <StyledTrigger>
        <RowHolder columns={4}>
          <Flex css={{ gap: "$2", ai: "center", color: "$gray12" }}>
            <Avatar fallback="UK" size="2" shape="square" />
            {activity.email}
          </Flex>
          <Flex>
            <Badge
              variant="cyan"
              css={{ fontFamily: "$mono", userSelect: "all" }}
              size="0"
            >
              {activity.id}
            </Badge>
          </Flex>
          <Flex>
            <Badge variant="green" css={{ gap: "$1", ai: "center" }} size="0">
              webauthn.login.initiated
            </Badge>
          </Flex>
          <Flex css={{ ai: "center", gap: "$1", jc: "space-between" }}>
            4 days ago
            <StyledIcon>
              <ChevronDownIcon />
            </StyledIcon>
          </Flex>
        </RowHolder>
      </StyledTrigger>
      <AccordionContent>
        <Flex css={{ py: "$3", px: "$4", gap: "$6" }}>
          <InfoGroup>
            <InfoGroupTitle>IP Address</InfoGroupTitle>
            <InfoGroupContent>{activity.ip_address}</InfoGroupContent>
          </InfoGroup>
          <InfoGroup>
            <InfoGroupTitle>User agent</InfoGroupTitle>
            <InfoGroupContent>{activity.user_agent}</InfoGroupContent>
          </InfoGroup>
        </Flex>
      </AccordionContent>
    </AccordionItem>
  );
};
