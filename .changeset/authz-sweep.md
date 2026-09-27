---
"@scute/js-core": patch
"@scute/react-hooks": patch
"@scute/auth-ui-react": patch
---

Authorization fixes from a bug sweep:

- Local decisions: an `exists` on an attribute you didn't pass (the user's, or a known object's) asks the server instead of answering locally, unless `strict`. Lookups read own keys of plain objects only (no array `length`, nothing from the prototype), equality is structural for lists and objects, and resource types are lowercased like the engine does. Null is missing on both sides; new conformance vectors cover it.
- `toSqlWhere`: an empty list compiles to `(col IS NULL AND NULL)` for a column, so a NOT around it can't select rows with no value.
- `useCan` / `usePermissions` never report the previous inputs' answer while a new check is in flight.
- `useElementDecisionLog.loadMore` loads each page once and drops pages answered for older filters.
