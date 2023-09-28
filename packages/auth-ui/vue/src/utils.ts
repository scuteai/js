// TODO(backlog): switch to reactive props with
// https://github.com/kimamula/ts-transformer-keys

import { safelyDefineElement } from "@scute/ui-elements";
import { camelize, defineComponent, h } from "vue";

export const getProps = <T>(attrs: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(attrs).map(([k, v]) => [camelize(k), v])
  ) as T;

export const createComponent = <T extends Record<string, any>>(
  Element: ReturnType<typeof safelyDefineElement>
) =>
  defineComponent(
    (_props: T, ctx) => {
      safelyDefineElement(Element);

      return () =>
        h(Element.elementName, {
          onVnodeBeforeMount: (vnode) => {
            const element = vnode.el as InstanceType<typeof Element>;
            element.props = getProps(ctx.attrs) as T;
          },
          onVnodeMounted(vnode) {
            const element = vnode.el as InstanceType<typeof Element>;
            element.props = getProps(ctx.attrs) as T;
          },
          onVnodeUpdated(vnode) {
            const element = vnode.el as InstanceType<typeof Element>;
            element.props = getProps(ctx.attrs) as T;
            element.propsChangedCallback()
          },
          onVnodeUnmounted(vnode) {
            const element = vnode.el as InstanceType<typeof Element>;
            element.props = getProps(ctx.attrs) as T;
            element.disconnectedCallback();
          },
        });
    },
    {
      inheritAttrs: false,
    }
  );
