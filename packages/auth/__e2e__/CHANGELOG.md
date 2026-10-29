# @scute/sdk-e2e

## 0.1.1-next.0

### Patch Changes

- Updated dependencies [f405658]
  - @scute/auth-ui-react@0.4.0-next.5
  - @scute/js-core@0.10.0-next.5
  - @scute/react-hooks@0.9.0-next.5

## 0.1.0

### Minor Changes

- Clear the session on a rejected refresh so a dead refresh token (stale post-0.7 migration cookie, revoked or cleaned-up session, or flushed token store) drops the user to a clean login instead of looping refresh/401 forever.
