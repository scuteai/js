import { createContext, useContext } from "react";
import type { Theme } from "@scute/ui-shared";

const ThemeContext = createContext<Theme | undefined>(undefined);

export const ThemeProvider = ({
  theme,
  children,
}: {
  theme: Theme;
  children: React.ReactNode;
}) => {
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  return context;
};
