import onChange from "on-change";
import { safelyDefineElement } from "./define";
import type { createElement, ComponentElementClass } from "./element";

type Component = ReturnType<typeof createElement>;

export const render = <T extends Component>(
  Component: T,
  props?: InstanceType<T>["props"],
  target?: Element | null,
  method: "replace" | "append" = "replace"
) => {
  safelyDefineElement(Component, Component.elementName);

  const element = new Component() as InstanceType<T>;
  element.props = props ?? {};

  if (target) {
    if (method === "replace") target.replaceWith(element);
    else if (method === "append") target.appendChild(element);
  }

  return element;
};

export const updateProps = <T extends InstanceType<ComponentElementClass<{}>>>(
  component: T,
  props: Partial<T["props"]>
) => {
  component.props = {
    ...(component.props ? onChange.target(component.props) : null),
    ...props,
  };

  // currently 'on-change' package does not seem
  // to handle spread well ¯\_(ツ)_/¯
  // so we are calling the callback explicitly
  component.propsChangedCallback();
};
