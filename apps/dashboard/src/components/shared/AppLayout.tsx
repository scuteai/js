import {
  styled,
  LayoutWrapper,
  Sidebar,
  Navbar,
  Content,
  Wrapper,
  LogoHolder,
  NavbarActions,
  NavbarHeader,
  Avatar,
  Flex,
  Status,
  TreeItem,
  TreeItemsContainer,
  Text,
  Separator,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@scute/ui";
import { Logo } from "@/components/shared/Logo";
import Link from "next/link";

import {
  CaretDownIcon,
  CheckCircledIcon,
  ChevronDownIcon,
  DashboardIcon,
  PlusCircledIcon,
} from "@radix-ui/react-icons";
import { ScuteApp } from "../../types";
import { useRouter } from "next/router";
import { useSignOut } from "../../scute/hooks/useSignOut";
import { ScuteNextProtected } from "@/utils/ScuteNextProtected";

const _APP = {
  id: "s3414dfa",
  name: "Scute dashboard",
  slug: "scute-d",
  url: "control.scute.io",
};

type AppLayoutProps = {
  children: JSX.Element;
};
export const AppLayout = ({ children }: AppLayoutProps) => {
  const handleSignOut = useSignOut();
  return (
    <LayoutWrapper>
      <Navbar>
        <NavbarHeader>
          <LogoHolder>
            <Link href="/apps">
              <Logo />
            </Link>
          </LogoHolder>
        </NavbarHeader>

        <NavbarActions>
          <ButtonLink>
            Changelog <Status variant="yellow"></Status>
          </ButtonLink>
          <ButtonLink>Documentation</ButtonLink>

          <DropdownMenu>
            <DropdownMenuTrigger asChild={true}>
              <Flex css={{ ai: "center" }}>
                <Avatar size="3" />
                <ChevronDownIcon />
              </Flex>
            </DropdownMenuTrigger>
            {/* @ts-ignore */}
            <DropdownMenuContent>
              <Link href="/profile">
                <DropdownMenuItem>Profile</DropdownMenuItem>
              </Link>
              <DropdownMenuItem onClick={() => handleSignOut()}>
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </NavbarActions>
      </Navbar>
      {children}
    </LayoutWrapper>
  );
};

const ButtonLink = styled("button", {
  all: "unset",
  display: "flex",
  ai: "center",
  gap: "$1",
  fontSize: "$1",
  color: "$gray10",
  cursor: "pointer",
  "&:hover": {
    color: "$gray12",
  },
});
