"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@scute/react";
import { PATHS } from "@/app/routes";
import type { ScuteAppData, ScuteUserData } from "@/types";
import { navItems, settingsNavItems } from "./items";
import styles from "@/styles/Layout.module.scss";
import { Avatar, Flex, IconButton, Text } from "@radix-ui/themes";
import { ReaderIcon } from "@radix-ui/react-icons";
import { LogoIcon } from "../shared/Logo";
import { ProfileDropdown } from "./ProfileDropdown";
import { NavItem } from "./NavItem";

export interface NavProps {
  appData?: ScuteAppData | null;
  currentUser: ScuteUserData;
}

export const Nav = ({ appData, currentUser }: NavProps) => {
  const pathname = usePathname();
  const { signOut } = useAuth();

  return (
    <Flex className={styles.Sidebar}>
      <Flex className={styles.Toolbar} direction="column">
        <Link href={PATHS.APPS}>
          <LogoIcon />
        </Link>
        <Flex direction="column" gap="3">
          <IconButton variant="soft" color="lime">
            <ReaderIcon />
          </IconButton>
          <ProfileDropdown
            currentUser={currentUser}
            signOut={() => signOut()}
          />
        </Flex>
      </Flex>
      {appData ? (
        <Flex className={styles.SidebarContent}>
          <Flex
            justify="between"
            align="center"
            className={styles.SidebarContentHeader}
          >
            <Flex gap="2" align="center">
              <Avatar
                src={appData.logo}
                size="1"
                fallback={appData.name.charAt(0)}
                color="green"
              />
              <Text size="3">{appData.name}</Text>
            </Flex>
          </Flex>
          <Flex className={styles.NavList} gap="0">
            {navItems.map((item, index) => {
              const itemPathname = item.pathname(appData.id);

              return (
                <NavItem
                  active={pathname === itemPathname}
                  key={index}
                  title={item.title}
                  icon={item.icon}
                  path={itemPathname}
                />
              );
            })}
            <Text
              size="3"
              style={{
                fontWeight: "500",
                color: "var(--black-a8)",
                marginTop: "10px",
                marginBottom: "10px",
                padding: "0px var(--space-4)",
              }}
            >
              Settings
            </Text>
            {settingsNavItems.map((item, index) => {
              const itemPathname = item.pathname(appData.id);

              return (
                <NavItem
                  active={pathname === itemPathname}
                  key={index}
                  title={item.title}
                  icon={item.icon}
                  path={itemPathname}
                />
              );
            })}
          </Flex>
        </Flex>
      ) : null}
    </Flex>
  );
};
