import { IconButton, Text, Flex, Avatar, DropdownMenu } from "@radix-ui/themes";
import { LogoIcon } from "./Logo";
import styles from "@/styles/Layout.module.scss";
import {
  BookmarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CrumpledPaperIcon,
  EnvelopeOpenIcon,
  GearIcon,
  LightningBoltIcon,
  LockClosedIcon,
  MixIcon,
  PaddingIcon,
  PersonIcon,
  ReaderIcon,
  TableIcon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import { useRouter } from "next/router";
import { getCurrentPageTitle } from "@/utils/router";
import { useAuth } from "@scute/react";
import { ReactElement, useEffect } from "react";

type LayoutProps = {
  children?: React.ReactNode;
  titleBarContent?: React.ReactNode;
};

export const Layout = ({ children, titleBarContent }: LayoutProps) => {
  const router = useRouter();
  const pageTitle = getCurrentPageTitle(router.pathname);
  const appId = router.query.id;
  const { session, signOut } = useAuth();

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.push("/");
    }
  }, [session.status, router]);

  if (session.status !== "authenticated") {
    return null;
  }

  const ProfileDropdown = () => {
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <IconButton color="gray" size="1" variant="ghost">
            <Avatar size="2" fallback="U" color="pink" />
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <Link legacyBehavior href="/profile">
            <DropdownMenu.Item>View profile</DropdownMenu.Item>
          </Link>
          <DropdownMenu.Item onClick={() => signOut()}>
            Logout
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    );
  };

  return (
    <div className={styles.AppLayout}>
      <Flex className={styles.Sidebar}>
        <Flex className={styles.Toolbar} direction="column">
          <Link href="/">
            <LogoIcon />
          </Link>
          <Flex direction="column" gap="3">
            <IconButton variant="soft" color="lime">
              <ReaderIcon />
            </IconButton>
            <ProfileDropdown />
          </Flex>
        </Flex>
        {appId ? <AppSidebar /> : null}
      </Flex>
      <Flex className={styles.MainContent}>
        <Flex className={styles.ContentTitleBar} justify="between">
          <Text>{pageTitle}</Text>
          {titleBarContent ? titleBarContent : null}
        </Flex>
        <div className={styles.Content}>{children}</div>
      </Flex>
    </div>
  );
};

const AppSidebar = () => {
  const router = useRouter();
  const pageTitle = getCurrentPageTitle(router.pathname);

  const appId = router.query.id;
  const NavItems = [
    {
      title: "Summary",
      icon: <CrumpledPaperIcon />,
      url: `/apps/${appId}`,
    },
    {
      title: "Users",
      icon: <PersonIcon />,
      url: `/apps/${appId}/users`,
    },
    {
      title: "Activity",
      icon: <LightningBoltIcon />,
      url: `/apps/${appId}/activity`,
    },
  ];
  const SettingsNavItems = [
    {
      title: "Application",
      icon: <BookmarkIcon />,
      url: `/apps/${appId}/settings`,
    },
    {
      title: "Auth",
      icon: <LockClosedIcon />,
      url: `/apps/${appId}/settings/auth`,
    },
    {
      title: "Metafields",
      icon: <TableIcon />,
      url: `/apps/${appId}/settings/metafields`,
    },
    {
      title: "Customize",
      icon: <PaddingIcon />,
      url: `/apps/${appId}/settings/customize`,
    },
    {
      title: "Email",
      icon: <EnvelopeOpenIcon />,
      url: `/apps/${appId}/settings/email`,
    },
    {
      title: "API Keys",
      icon: <MixIcon />,
      url: `/apps/${appId}/settings/api-keys`,
    },
  ];

  return (
    <Flex className={styles.SidebarContent}>
      <Flex
        justify="between"
        align="center"
        className={styles.SidebarContentHeader}
      >
        <Flex gap="2" align="center">
          <Avatar size="1" fallback="T" color="green" />
          <Text size="3">example app</Text>
        </Flex>
      </Flex>
      <Flex className={styles.NavList} gap="2">
        {NavItems.map((item, index) => (
          <NavItem
            active={pageTitle === item.title}
            key={index}
            title={item.title}
            icon={item.icon}
            url={item.url}
          />
        ))}
        <Text
          size="3"
          style={{
            fontWeight: "500",
            color: "var(--black-a8)",
            marginTop: "10px",
            padding: "0px var(--space-4)",
          }}
        >
          Settings
        </Text>
        {SettingsNavItems.map((item, index) => (
          <NavItem
            active={pageTitle === item.title}
            key={index}
            title={item.title}
            icon={item.icon}
            url={item.url}
          />
        ))}
      </Flex>
    </Flex>
  );
};

type NavItemType = {
  title: string;
  icon: React.ReactNode;
  url?: string;
  active?: boolean;
};

const NavItem = ({ title, icon, active, url = "#" }: NavItemType) => {
  const klasses = () => {
    if (active) {
      return `${styles.NavItem} ${styles.NavItemActive}`;
    } else {
      return styles.NavItem;
    }
  };
  return (
    <Link href={url} className={klasses()}>
      <Flex align="center" gap="2">
        {icon}
        <Text size="4">{title}</Text>
      </Flex>
    </Link>
  );
};
