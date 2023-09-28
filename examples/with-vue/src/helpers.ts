import { readonly, ref } from "vue";

export function useState<T = any>(initialState: T) {
  const state = ref(initialState);
  const setState = (newState: any) => {
    state.value = newState;
  };

  return [readonly(state), setState];
}
