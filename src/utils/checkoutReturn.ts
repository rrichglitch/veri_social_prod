// After returning from Stripe Checkout the browser history contains the
// checkout.stripe.com entry. The in-app back button must never walk back into
// it — and after a payment flow the back button should jump the WHOLE detour
// (original /me -> flow page -> Stripe -> landing) back to the page the user
// was on before they first entered /me.
//
// Landing pages call markCheckoutReturn() on mount; the back button calls
// skipCheckoutDetour(), which clears the marker and jumps 4 entries back —
// the landing page is always exactly 4 entries above the pre-flow page:
//   [.., X(pre-flow), /me, flow page, checkout.stripe.com, landing]
const KEY = 'veri_checkout_return';

export function markCheckoutReturn(): void {
  sessionStorage.setItem(KEY, '1');
}

// Returns true (and performs the jump) when the in-app back button should skip
// the payment detour. Call it instead of navigate(-1) on the landing pages.
export function skipCheckoutDetour(): boolean {
  if (sessionStorage.getItem(KEY) !== '1') return false;
  sessionStorage.removeItem(KEY);
  window.history.go(-4);
  return true;
}

export function hasCheckoutReturnMarker(): boolean {
  return sessionStorage.getItem(KEY) === '1';
}

export function clearCheckoutReturnMarker(): void {
  sessionStorage.removeItem(KEY);
}