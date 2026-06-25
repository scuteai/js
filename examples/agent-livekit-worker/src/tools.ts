// Fake customer-hosted order DB. In production these tools would call your
// real backend; the gate decides whether the call is allowed first.
export function createOrderDb(): Record<number, { status: string; amount: number }> {
  return { 4471: { status: "paid", amount: 120 } };
}
