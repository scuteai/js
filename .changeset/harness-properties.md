---
"@scute/harness": minor
---

Properties (RB-42): `run.property(name)` reads one of the app's secrets inside a tool, at call time, with the task token. `run.sign(name, { claims } | { data })` signs with one of the app's key pairs; the private key never leaves Scute. Only the property's listed agents can use it, and only while the task is live (and allowed the property's permission, when it names one). Use the value, don't return it: it should never reach the model.
