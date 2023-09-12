import type { ScuteAppData, ScuteUserData } from "@/types";
import styles from "@/styles/Layout.module.scss";
import { Flex, Text } from "@radix-ui/themes";
import { Nav } from "../nav/Nav";

export interface BaseLayoutProps {
  children: React.ReactNode;
  appData?: ScuteAppData | null;
  currentUser: ScuteUserData;
  pageTitle: string;
  titleBarContent?: React.ReactNode;
}

export const BaseLayout = ({
  children,
  appData,
  currentUser,
  pageTitle,
  titleBarContent,
}: BaseLayoutProps) => {
  return (
    <div className={styles.AppLayout}>
      <Nav appData={appData} currentUser={currentUser} />
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
