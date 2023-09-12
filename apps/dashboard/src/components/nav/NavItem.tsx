import Link from "next/link";
import cx from "classnames";
import styles from "@/styles/Layout.module.scss";
import { Flex, Text } from "@radix-ui/themes";

interface NavItemProps {
  title: string;
  icon: React.ReactNode;
  path?: string;
  active?: boolean;
}

export const NavItem = ({ title, icon, active, path = "#" }: NavItemProps) => {
  return (
    <Link
      href={path}
      className={cx(styles.NavItem, {
        [styles.NavItemActive]: active,
      })}
    >
      <Flex align="center" gap="2">
        {icon}
        <Text size="3">{title}</Text>
      </Flex>
    </Link>
  );
};
