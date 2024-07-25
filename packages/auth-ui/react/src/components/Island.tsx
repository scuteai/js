import { styled } from "../stitches.config";
import { EmailIcon } from "../assets/icons";
import { keyframes } from "@stitches/react";

const IslandHolder = styled("div", {
  position: "absolute",
  width: "100%",
  left: 0,
  top: 0,
  transform: "translateY(-100px)",
  transition: "transform 0.85s cubic-bezier(0.075, 0.82, 0.165, 1)",
  "& .island": {
    // box-shadow: 0px 0px 52px rgba(48, 69, 255, 0.1);
  },
  "&[data-active='true']": {
    transform: "translateY(20px)",
  },
});

const IslandInner = styled("div", {
  height: 54,
  borderRadius: 26,
  width: "100%",
  maxWidth: 300,
  margin: "0px auto",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "0px 4px",
  border: "1px solid #f1f1f1",
  // boxShadow: "0px 0px 52px rgba(0, 0, 0, 0.1)",
  background: "$surfaceBg",
});

const IslandIcon = styled("div", {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  height: 44,
  width: 44,
  borderRadius: 100,
  background: "$cardBg",
});

const IslandIconPrimary = styled(IslandIcon, {
  background: "$cardBg !important",
});

const IslandLabel = styled("div", {
  fontSize: 15,
  color: "$surfaceText",
  fontWeight: 500,
});

const rotate = keyframes({
  "0%": { transform: "rotate(0deg)" },
  "100%": { transform: "rotate(360deg)" },
});

const Loader = styled("span", {
  width: 24,
  height: 24,
  border: "5px dotted $loadingSpinnerColor",
  borderRadius: "50%",
  display: "inline-block",
  position: "relative",
  boxXizing: "border-box",
  animation: `${rotate} 5s linear infinite`,
});

export type IslandProps = {
  active: boolean;
  label: string;
  Icon: JSX.Element;
};

export const Island = ({ active, label, Icon }: IslandProps) => (
  <IslandHolder data-active={active}>
    <IslandInner>
      <IslandIconPrimary>{Icon}</IslandIconPrimary>
      <IslandLabel>{label}</IslandLabel>
      <IslandIcon>
        <Loader />
      </IslandIcon>
    </IslandInner>
  </IslandHolder>
);
