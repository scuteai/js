// Consistent wrapper to hold settings sections
import { Flex, Text, Heading, Section, Separator } from "@radix-ui/themes";

type SettingSectionShellProps = {
  children: React.ReactNode;
  title?: string;
  description?: string;
  separator?: boolean;
  flexRow?: boolean;
};

export const SettingSectionShell = ({
  children,
  title,
  description,
  separator,
  flexRow,
}: SettingSectionShellProps) => {
  return (
    <>
      <Section style={{ padding: "0px" }}>
        {/*  TODO: Fix mobile */}
        <Flex direction={flexRow ? "row" : "column"} justify="between">
          <Flex
            gap="1"
            direction="column"
            style={{ marginBottom: "var(--space-3)" }}
          >
            {title ? <Heading size="3">{title}</Heading> : null}

            {description ? (
              <Text color="gray" size="1">
                {description}
              </Text>
            ) : null}
          </Flex>
          {flexRow ? (
            <Flex
              style={{
                flexGrow: "1",
                width: "40%",
                justifyContent: "flex-end",
              }}
            >
              {children}
            </Flex>
          ) : (
            children
          )}
        </Flex>
      </Section>
      {separator ? <Separator orientation="horizontal" size="4" /> : null}
    </>
  );
};
