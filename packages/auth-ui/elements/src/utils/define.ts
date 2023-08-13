import type { createElement } from "./element";

export const safelyDefineElement = <T extends ReturnType<typeof createElement>>(
  Component: T,
  elementName?: string
) => {
  elementName = elementName ?? Component.elementName;

  if (!elementName) {
    throw new Error("Cannot define empty elementName.");
  }

  try {
    if (!window.customElements.get(elementName)) {
      window.customElements.define(elementName, Component);
    }
  } catch (e2) {
    throw new Error(
      `Cannot define custom element <${elementName}>. Ensure you are in the browser environment.`
    );
  }

  return Component;
};
