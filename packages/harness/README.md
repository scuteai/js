# @scute/harness

Guardrails for the agents you build. Guards decide on every tool call:
who may do what (Scute's engine), whether the person has to verify or
confirm, whether an argument was made up, whether a budget is spent. It
works with the agent framework you already use and any model provider,
because it hooks the tool calls, not the model.

```sh
pnpm add @scute/harness
```

Set `SCUTE_APP_ID` and `SCUTE_SECRET` (server side; neither ever reaches the
model), and register the agent in Scute with an owner and roles.

```ts
import { createHarness, guards } from "@scute/harness";

export const harness = createHarness({
  agent: "support-bot",
  guards: [
    guards.permissions(), // the agent's roles, the person it works for, and this task: all three
    guards.approval({ when: { tier: "high" } }), // the person confirms risky calls
    guards.grounding(), // ids and amounts come from the person or a tool, not the model
    guards.args({ refund_invoice: { amount: { max: 500 } } }),
    guards.budget({ calls: 20, perHour: { high: 5 } }),
    guards.content({ pii: ["card", "ssn"] }),
  ],
  tools: { refund_invoice: { tier: "high" } },
});
```

## With the Vercel AI SDK (v7)

```ts
import { generateText, isStepCount } from "ai";

const run = harness.run({ id: chat.id, actsFor: user.id, task: { actions: ["invoice:read", "invoice:refund"] } });

const result = await generateText({
  model,
  messages,
  tools: run.tools({ refund_invoice, read_invoice }),
  toolApproval: run.toolApproval, // verify and confirm become 'user-approval'; deny and guide become 'denied'
  prepareStep: run.prepareStep, // hides tools the task can never use
  stopWhen: [isStepCount(20), run.budgetExceeded],
});
```

When a call doesn't run, the model gets a message that says what to do
next ("Don't guess invoice_id: ask the person"), so it recovers instead of
retrying blindly.

## Any other loop

```ts
const refund = run.wrap("refund_invoice", async (args) => billing.refund(args));
await refund({ invoice_id: "INV-1", amount: 90 }); // the result, or the message for the model

const verdict = await run.check("refund_invoice", args, { messages }); // or check yourself
```

## Decisions

Each guard answers one of: `proceed`, `transform` (run with other
arguments), `approve` (someone confirms), `verify` (the person proves it's
them), `guide` (don't run; tell the model what to do), `redirect`, `deny`.
The strictest enforced answer wins. A guard that throws counts as `deny`
(fail closed).

Every guard runs in a mode: `enforce`, `monitor` (records and calls
`onAlert`, never blocks) or `observe` (records only). Start a new guard in
`observe`, watch `onDecision`, then enforce.

## Tools map to permissions by name

`refund_invoice` needs `invoice:refund` on the invoice named by
`invoice_id` (or `invoiceId`, or `id`); plain arguments become attributes
for policy conditions (`resource.amount < 500`). Override per tool:

```ts
tools: {
  send_money: { permission: "payment:create", key: "to", tier: "high" },
  get_weather: false, // no permission check
}
```

## People in the loop

- **Verify.** A permission that needs verification (or `guards.verifyPerson()`)
  answers `verify`. Everything works with the task token alone:
  `run.startVerification({ method: "email_otp" })` sends a code (or
  `entra_push`, `sms_otp`, `totp`), `run.submitCode(code)` passes on what the
  person read out, `run.verificationStatus()` checks a push. Scute checks
  it's the right person; the next check of that permission goes through.
- **Let the model do it.** Give it the human tools and it verifies the
  person itself, mid-conversation (voice or chat):

  ```ts
  import { jsonSchema } from "ai";
  tools: { ...run.tools(myTools), ...run.humanTools(jsonSchema) }
  ```

  `scute_verify_person`, `scute_submit_code`, `scute_check_verification`,
  `scute_approval_status` and `scute_whoami`. Every answer has a `say` line
  the agent can speak as is ("I've emailed a code to a***@example.com.
  What's the code?"). Blocked calls tell the model which tool to use.
- **Confirm.** `guards.approval()` asks the person the agent works for. With
  the AI SDK that's the tool approval request in your chat UI; elsewhere,
  call `run.confirm(tool, args)` when they confirm, and that exact call
  goes through once.
- **Reviewer approval.** A permission that requires approval files a Scute
  access request for the exact operation, tagged with the agent and task
  (`verdict.say`: "I've asked for approval..."); the call goes through once
  a reviewer approves it. `run.approvalStatus(id)` checks on it.

## Runs and state

A run is one job: a short-lived Scute task (token minted on first use,
never shown to the model), its session, and what guards remember. Reuse
`id` to resume across requests; in serverless apps pass a shared `store`
(`{ get, set }` over Redis, KV or a table). `run.complete()` or
`run.revoke()` ends the task; suspending the agent in Scute ends them all.
An agent process without the secret key can run on a task token your
backend minted: `harness.run({ token })`.

## Your own guards

```ts
guards.define("no-weekend-refunds", (call) =>
  call.tool === "refund_invoice" && [0, 6].includes(new Date().getUTCDay())
    ? call.guide("Refunds wait until Monday; offer to schedule one.")
    : call.proceed()
);
```

## License

MIT
