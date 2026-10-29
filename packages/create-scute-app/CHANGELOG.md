# create-scute-app

## 0.3.0-next.0

### Minor Changes

- 5550bbd: `create-scute-app` writes its files from shared recipes, now also exported as `create-scute-app/recipes` (the same files, packages and env line the Scute dashboard shows). It covers Next.js, React, plain JavaScript, Node, Astro, Remix and TanStack Start; installs with the project's package manager; adds only the framework's app ID line to the env file; never overwrites an existing file or env value; and takes `--framework`, `--app-id` and `--no-install`. The Next.js auth route no longer has `// @ts-nocheck`. It no longer asks for the app secret or API URL.

## 0.2.0

### Minor Changes

- Clear the session on a rejected refresh so a dead refresh token (stale post-0.7 migration cookie, revoked or cleaned-up session, or flushed token store) drops the user to a clean login instead of looping refresh/401 forever.
