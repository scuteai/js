import {
  styled,
  LayoutWrapper,
  Navbar,
  LogoHolder,
  NavbarActions,
  NavbarHeader,
  Avatar,
  Flex,
  Status,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@scute/ui";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Logo } from "@/components/shared/Logo";
import Link from "next/link";
import Protected from "./Protected";
import { useAuth } from "@scute/nextjs";

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
  const { session, signOut } = useAuth();

  return (
    <Protected>
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
              <DropdownMenuContent>
                <Link href="/profile">
                  <DropdownMenuItem>Profile</DropdownMenuItem>
                </Link>
                <DropdownMenuItem onClick={() => signOut()}>
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </NavbarActions>
        </Navbar>
        {children}
      </LayoutWrapper>
    </Protected>
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
