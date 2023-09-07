import { Inset, Flex } from "@radix-ui/themes";

export const SCardBottom = ({ children }: { children: React.ReactNode }) => {
  return (
    <Inset
      pb="0"
      style={{ background: "var(--gray-2)", padding: "var(--space-5)" }}
    >
      <Flex justify="end">{children}</Flex>
    </Inset>
  );
};
