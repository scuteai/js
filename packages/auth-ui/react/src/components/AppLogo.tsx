import { Flex } from "./Flex";

export const AppLogo = ({
  url,
  alt,
  size = 1,
}: {
  url: string;
  alt: string;
  size: 1 | 2;
}) => {
  const getSize = () => {
    if (size === 2) return "120px";
    else return "30px";
  };
  return (
    <Flex css={{ overflow: "hidden", borderRadius: "$1" }}>
      <img height={getSize()} width={getSize()} src={url} alt={alt} />
    </Flex>
  );
};
