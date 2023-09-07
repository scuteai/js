import {
  Flex,
  Text,
  Card,
  Box,
  Avatar,
  IconButton,
  Badge,
} from "@radix-ui/themes";
import { ChevronRightIcon, DotsVerticalIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { ScuteApp } from "@/types";


type AppCardProps = {
  app:ScuteApp
};
export const AppCard = ({ app }: AppCardProps) => {
  return (
    <Link href="/apps/1" legacyBehavior>
      <Card size="1" className="app-card" variant="classic">
        <Flex
          gap="3"
          justify="between"
          align="center"
          style={{ width: "100%" }}
        >
          <Flex gap="3">
            <Avatar size="4" fallback="T" color="green" />
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
