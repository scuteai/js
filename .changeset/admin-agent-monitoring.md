---
"@scute/js-core": minor
---

Agent monitoring from your backend:

- `admin.agentMonitor({ status, kind, agent })` lists what agents' safety rails caught (first use of a permission, a loop, a pause over budget).
- `admin.reviewAgentMonitorItem(id, { status, note })` acknowledges or flags an item.
- `admin.agentReport(slug, { from, to })` is the evidence report for a period.
- `admin.verifyDecisionLog({ from, to })` checks that the decision log hasn't been changed, cut or reordered.
- `admin.suspendAllAgents(reason)` stops every agent of the app at once.
