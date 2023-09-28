import React from "react";
import ReactDOM from "react-dom/client";
import onChange from "on-change";

export function createElement<T extends {}>(
  Component: React.FunctionComponent<T>,
  elementName: string,
  props?: T
) {
  class ComponentElement extends HTMLElement {
    // currently no shadow dom
    #_mountPoint = this;
    #_reactRoot: ReactDOM.Root | null = null;

    static elementName = elementName;

    props = props as T;

    connectedCallback() {
      const reactElement = React.createElement(Component, this.props);

      if (!this.#_reactRoot) {
        // avoiding root creating errors
        this.#_reactRoot = ReactDOM.createRoot(this.#_mountPoint);
      }

      this.#_reactRoot.render(reactElement);

      this.props = onChange<T>((this.props ?? {}) as T, () => {
        this.propsChangedCallback();
      });
    }

    disconnectedCallback() {
      if (this.props) {
        this.props = onChange.unsubscribe(this.props);
      }

      if (!this.#_mountPoint || !this.#_reactRoot) {
        return;
      }

      this.#_reactRoot.unmount();
    }

    // shim method for rendering based props property
    propsChangedCallback() {
      if (!this.#_mountPoint || !this.#_reactRoot) {
        return;
      }

      const props = this.props ? onChange.target(this.props) : this.props;

      const reactElement = React.createElement(Component, props);
      this.#_reactRoot.render(reactElement);
    }

    attributeChangedCallback() {
      this.propsChangedCallback();
    }
  }

  return ComponentElement as ComponentElementClass<T>;
}

// fix d.ts bundle size
export interface ComponentElementClass<T> {
  new (...params: any[]): {
    props: T;
    connectedCallback: () => void;
    disconnectedCallback: () => void;
    propsChangedCallback: () => void;
  } & HTMLElement;
  elementName: string;
}


