// Payments relay client — Stripe Checkout session creation + cancellation.
// The relay lives on the VPS (auth.veri.social/payments); it never exposes
// Stripe secret keys to the browser.
import { PAYMENTS_RELAY_URL } from '../config';

export async function requestCheckout(
  kind: 'pro' | 'org',
  identity: string,
  email?: string,
): Promise<{ url: string; sessionId: string }> {
  const resp = await fetch(`${PAYMENTS_RELAY_URL}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, identity, email }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.url) {
    throw new Error(data.error || `Checkout failed (${resp.status})`);
  }
  return data as { url: string; sessionId: string };
}

// Cancel the Pro subscription at the end of the current billing period
// (Stripe-side). The user keeps Pro until period end — webhook flips it off.
export async function cancelSubscriptionViaStripe(identity: string): Promise<void> {
  const resp = await fetch(`${PAYMENTS_RELAY_URL}/api/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity }),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    const err: any = new Error(data.error || `Cancel failed (${resp.status})`);
    err.status = resp.status;
    throw err;
  }
}