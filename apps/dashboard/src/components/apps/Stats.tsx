import { Flex, Text, Card, Box, Grid } from "@radix-ui/themes";
import styles from "@/styles/Stats.module.scss";
import { ArrowRightIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import Link from "next/link";
export const MultipleStats = () => {
  return (
    <Card variant="classic">
      <Grid columns={{ initial: "2", md: "4" }} gap="5" width="auto">
        <Flex className={styles.StatColumn}>
          <StatItem title="Active users" value="41" secondValue="2%" />
        </Flex>
        <Flex className={styles.StatColumn}>
          <StatItem title="Monthly active" value="41" url="#" />
        </Flex>
        <Flex className={styles.StatColumn}>
          <StatItem title="Signups today" value="41" />
        </Flex>
        <Flex className={styles.StatColumn}>
          <StatItem title="All users" value="41" />
        </Flex>
      </Grid>
    </Card>
  );
};

type StatType = {
  title: string;
  value: string;
  secondValue?: string;
  icon?: React.ReactNode;
  url?: string;
};

export const StatItem = ({
  title,
  value,
  secondValue,
  icon,
  url,
}: StatType) => {
  const Title = () => (
    <Flex align="center" justify="between">
      <Text size="1">{title}</Text>
    </Flex>
  );

  const Label = () => {
    if (url) {
      return (
        <Link legacyBehavior href={url}>
          <Flex align='center' justify='between'><Text size="1">{title}</Text> <ChevronRightIcon /></Flex>
        </Link>
      );
    } else {
      return Title();
    }
  };

  return (
    <Flex direction={"column"} gap="4" style={{ width: "100%" }}>
      <Label />
      <Flex gap="2">
        <Text size="7">{value}</Text>
        {secondValue ? (
          <Flex align="center" className={styles.StatSecondValue} gap="1">
            <ArrowRightIcon />
            <Text size="5">{secondValue}</Text>
          </Flex>
        ) : null}
      </Flex>
    </Flex>
  );
};
