---
"@scute/js-core": patch
---

A secret key passed to a browser client is now ignored (with the existing warning) instead of being sent on admin requests, where anyone loading the page could read it.
