---
"@scute/js-core": minor
"@scute/auth-ui-react": patch
---

Security: the sign-in URL scrub now also removes `sct_oauth` and `sct_sk`, not only `sct_magic`. SAML SSO and social OAuth land with `sct_oauth`, so that token could stay in browser history if verification failed. New `scrubAuthTokensFromUrl(href)` helper in `@scute/js-core` does it in one place.
