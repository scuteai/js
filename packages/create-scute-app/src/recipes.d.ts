export type FrameworkId = "nextjs" | "react" | "javascript" | "node" | "astro" | "remix" | "tanstack";

export type RecipeFile = { path: string; code: string };

export type SdkRecipe = {
  id: FrameworkId;
  label: string;
  language: "tsx" | "js";
  /** One file: its path. More: undefined, and each file in `code` starts with its path. */
  filename?: string;
  /** The files as one snippet. */
  code: string;
  files: RecipeFile[];
  packages: string[];
  /** `npm install` with the packages. */
  install: string;
  /** Where the env line goes (.env.local or .env) and the line itself. */
  envFile: string;
  env: string;
  envNote?: string;
  /** What to do after the files are in. */
  then?: string;
  docs: string;
};

/**
 * ScuteSignIn's props (@scute/auth-ui-react) that can be written into code:
 * plain values only. A logo is a URL; `illustration: false` turns it off.
 */
export type SignInSettings = {
  appearance: { accentColor?: string; theme?: string; radius?: string; fontFamily?: string; layout?: string; logo?: string; illustration?: false };
  copy: { title?: string; subtitle?: string; emailLabel?: string; emailPlaceholder?: string; continueLabel?: string };
  legal: { termsUrl?: string; privacyUrl?: string };
  methods: { google?: boolean };
};

export declare const DOCS: string;
export declare const PASSED_IN: string;
export declare const PACKAGE_INK: string;
export declare const SIGN_IN_DEFAULTS: {
  readonly appearance: { readonly theme: "light"; readonly radius: "medium"; readonly layout: "page" };
  readonly copy: {
    readonly title: string; readonly subtitle: string; readonly emailLabel: string;
    readonly emailPlaceholder: string; readonly continueLabel: string;
  };
  readonly methods: { readonly google: false };
};
export declare const FRAMEWORKS: { id: FrameworkId; label: string }[];

/** Each group's set values that differ from SIGN_IN_DEFAULTS, trimmed. */
export declare function changedProps<S extends SignInSettings>(s: S): Partial<S>;
/** `<component ...props>` with the changed props, `indent` spaces in, around `children` (or self-closing). */
export declare function jsxOf(component: string, s: SignInSettings | undefined, indent?: number, children?: string): string;
export declare function sdkRecipe(id: FrameworkId, appId: string, signIn?: SignInSettings): SdkRecipe;
export declare function sdkRecipes(appId: string, signIn?: SignInSettings): SdkRecipe[];
