import {
  ScuteClient,
  type Session,
  type ScuteUser,
  sessionLoadingState,
} from "@scute/core";
import {
  computed,
  defineComponent,
  inject,
  InjectionKey,
  provide,
  ref,
  readonly,
  type Ref,
  type ComputedRef,
} from "vue";

export type AuthSession = {
  session: Readonly<Ref<Session>>;
  signOut: () => ReturnType<ScuteClient["signOut"]>;
} & (
  | {
      user: Readonly<Ref<null>>;
      isAuthenticated: ComputedRef<false>;
      isLoading: ComputedRef<false>;
    }
  | {
      user: Readonly<Ref<null>>;
      isAuthenticated: ComputedRef<false>;
      isLoading: ComputedRef<true>;
    }
  | {
      user: Readonly<Ref<ScuteUser>>;
      isAuthenticated: ComputedRef<true>;
      isLoading: ComputedRef<false>;
    }
);

const AuthContext = Symbol() as InjectionKey<AuthSession>;
const ScuteClientContext = Symbol() as InjectionKey<ScuteClient>;

export type AuthContextProviderProps = {
  scuteClient: ScuteClient;
};

export const AuthContextProvider = defineComponent(
  (props: AuthContextProviderProps, { slots }) => {
    const session = ref(sessionLoadingState());
    const user = ref<ScuteUser | null>(null);
    const scuteClient = props.scuteClient;

    scuteClient.onAuthStateChange(async (_event, newSession, newUser) => {
      session.value = newSession;
      user.value = newUser;
    });

    provide(AuthContext, {
      session: readonly(session),
      user: readonly(user) as Readonly<Ref<null>> | Readonly<Ref<ScuteUser>>,
      //@ts-ignore
      isAuthenticated: computed(() => session.value.status === "authenticated"),
      //@ts-ignore
      isLoading: computed(() => session.value.status === "loading"),
      signOut: () => scuteClient.signOut(),
    });

    provide(ScuteClientContext, scuteClient);

    return () => slots.default?.();
  },
  {
    props: ["scuteClient"],
  }
);

export const useAuth = () => {
  const context = inject(AuthContext);
  if (context === undefined) {
    throw new Error(`useAuth must be used within a AuthContextProvider.`);
  }
  return context;
};

export const useScuteClient = () => {
  const context = inject(ScuteClientContext);
  if (context === undefined) {
    throw new Error(
      `useScuteClient must be used within a AuthContextProvider.`
    );
  }
  return context;
};
