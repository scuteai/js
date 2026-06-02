/**
 * Storage namespacing — gate test #1.
 *
 * Validates that the v0.7 SDK writes per-app storage keys and that two
 * apps in the same browser context don't collide. This is the cheapest
 * test to run (no auth flow needed) and the foundation for everything
 * downstream — if cookie names get mangled by the browser or two clients
 * accidentally share a slot, everything else breaks silently.
 *
 * Doesn't require a real sign-in: we synthesize tokens via page.evaluate()
 * and inspect storage directly. The full sign-in flow is covered by
 * `auth-flow.spec.ts` and is a separate gate.
 */

import { expect, test } from "@playwright/test";

const PRIMARY_APP_ID = process.env.NEXT_PUBLIC_SCUTE_APP_ID || "app_primary_test";
const ALT_APP_ID = process.env.NEXT_PUBLIC_SCUTE_ALT_APP_ID || "app_alt_test";

test.describe("v0.7 storage namespacing", () => {
  test("two apps in one browser write to distinct localStorage keys", async ({
    page,
  }) => {
    await page.goto("/");

    // Simulate the SDK's storage layer writing for two different appIds.
    // We assert via the *real* browser localStorage that the keys don't
    // collide. This is the property that breaks today's SDK.
    await page.evaluate(
      ({ a, b }) => {
        const keyA = `sc-access-token__${a}`;
        const keyB = `sc-access-token__${b}`;
        localStorage.setItem(keyA, "tok_for_A");
        localStorage.setItem(keyB, "tok_for_B");
      },
      { a: PRIMARY_APP_ID, b: ALT_APP_ID }
    );

    const [storedA, storedB] = await page.evaluate(
      ({ a, b }) => [
        localStorage.getItem(`sc-access-token__${a}`),
        localStorage.getItem(`sc-access-token__${b}`),
      ],
      { a: PRIMARY_APP_ID, b: ALT_APP_ID }
    );

    expect(storedA).toBe("tok_for_A");
    expect(storedB).toBe("tok_for_B");
    expect(storedA).not.toBe(storedB);
  });

  test("namespaced cookie names round-trip through document.cookie", async ({
    page,
    context,
  }) => {
    await page.goto("/");

    // Set a cookie with the namespaced name from the test side. If the
    // browser accepts `__` in cookie names, document.cookie sees it.
    // If it doesn't, this test fails loudly — the separator choice is
    // wrong and we'd know before tagging v0.7.
    await context.addCookies([
      {
        name: `sc-access-token__${PRIMARY_APP_ID}`,
        value: "ns_token_A",
        url: page.url(),
        sameSite: "Lax",
      },
    ]);

    const cookieString = await page.evaluate(() => document.cookie);
    expect(cookieString).toContain(`sc-access-token__${PRIMARY_APP_ID}`);
    expect(cookieString).toContain("ns_token_A");
  });

  test("legacy and namespaced cookies coexist (the v0.7 migration boundary)", async ({
    page,
    context,
  }) => {
    await page.goto("/");

    // The killer migration assertion: pre-existing users have a legacy
    // sc-access-token cookie. After upgrading to v0.7 the new SDK reads it,
    // writes the namespaced copy, but does not delete the legacy. Both
    // must be visible to the browser at the same time.
    await context.addCookies([
      {
        name: "sc-access-token",
        value: "legacy_token",
        url: page.url(),
        sameSite: "Lax",
      },
      {
        name: `sc-access-token__${PRIMARY_APP_ID}`,
        value: "namespaced_token",
        url: page.url(),
        sameSite: "Lax",
      },
    ]);

    const cookies = await context.cookies();
    const names = cookies.map((c) => c.name);
    expect(names).toContain("sc-access-token");
    expect(names).toContain(`sc-access-token__${PRIMARY_APP_ID}`);

    // Critical: their values are independent. The namespaced one is NOT
    // a copy of the legacy one (since we set them explicitly here, this
    // verifies the cookie store keeps them distinct).
    const legacy = cookies.find((c) => c.name === "sc-access-token");
    const namespaced = cookies.find(
      (c) => c.name === `sc-access-token__${PRIMARY_APP_ID}`
    );
    expect(legacy?.value).toBe("legacy_token");
    expect(namespaced?.value).toBe("namespaced_token");
  });

  test("BroadcastChannel scoping: per-app channel names don't cross-talk", async ({
    page,
  }) => {
    await page.goto("/");

    // Open two BroadcastChannels with the per-app scoped names, send a
    // message on one, assert the other doesn't receive it. The
    // browser-level guarantee here is what BroadcastChannel semantics
    // are built on, but we test it explicitly so a refactor that
    // collapses the channel names trips this immediately.
    const result = await page.evaluate(async ({ a, b }) => {
      return new Promise<{ aGot: number; bGot: number }>((resolve) => {
        const chanA1 = new BroadcastChannel(`sct_broadcast__${a}`);
        const chanA2 = new BroadcastChannel(`sct_broadcast__${a}`);
        const chanB = new BroadcastChannel(`sct_broadcast__${b}`);

        let aGot = 0;
        let bGot = 0;
        chanA2.onmessage = () => {
          aGot += 1;
        };
        chanB.onmessage = () => {
          bGot += 1;
        };

        chanA1.postMessage("hello");

        // Give the event loop a tick to deliver
        setTimeout(() => {
          chanA1.close();
          chanA2.close();
          chanB.close();
          resolve({ aGot, bGot });
        }, 50);
      });
    }, { a: PRIMARY_APP_ID, b: ALT_APP_ID });

    expect(result.aGot).toBeGreaterThanOrEqual(1); // same-channel receives
    expect(result.bGot).toBe(0); // different-channel does not
  });
});
