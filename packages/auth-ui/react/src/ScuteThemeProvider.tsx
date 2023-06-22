import React, { createContext, createElement } from "react";
export type CustomTheme = any; // TODO: define type

import { createTheme } from "@scute/ui-shared";

type ContextValue = {
  theme?: any;
};

const Context = createContext<ContextValue | null>(null);

export type ScuteThemeProviderProps = {
  children?: React.ReactNode;
  theme?: any;
};

export const ScuteThemeProvider: React.FC<ScuteThemeProviderProps> = ({
  children,
  theme,
}) => {
  const value = {
    theme,
  };

  const customTheme = createTheme(theme);

  return createElement(
    Context.Provider,
    { value },
    <div className={customTheme}>{children as any}</div>
  );
};

export const useThemeContext = () => {
  const context = React.useContext(Context);
  if (!context) throw Error("ScuteThemeProvider must be inside a Provider.");
  return context;
};
