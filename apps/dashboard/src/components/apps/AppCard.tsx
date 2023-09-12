import Link from "next/link";
import type { ScuteApp } from "@/types";
import { Flex, Text, Card, Box, Avatar } from "@radix-ui/themes";
import { ChevronRightIcon } from "@radix-ui/react-icons";

type AppCardProps = {
  app: ScuteApp;
};

export const AppCard = ({ app }: AppCardProps) => {
  return (
    <Link href={`apps/${app.id}`} legacyBehavior>
      <Card size="1" className="app-card" variant="classic">
        <Flex
          gap="3"
          justify="between"
          align="center"
          style={{ width: "100%" }}
        >
          <Flex gap="3">
            <Avatar
              src={app.logo}
              fallback={app.name.charAt(0)}
              size="4"
              color="green"
            />
            <Box>
              <Text as="div" size="3" weight="bold">
                {app.name}
              </Text>
              <Text as="div" size="2" color="gray">
                {app.origin}
              </Text>
            </Box>
          </Flex>
          <Flex align="center" gap="4">
            {/* <Badge color="purple" size="1" variant="solid" highContrast={true}>
              PRO
            </Badge> */}
            <ChevronRightIcon />
          </Flex>
        </Flex>
      </Card>
    </Link>
  );
};
