# Security Audit — TinyHoney LP (2026-10-21)

> **Resolution in repo (2026-10-21):** the LP calls the existing
> `duitku-lp-order`, updated to build `2026-10-21-server-amount-env`. It computes
> the Duitku `paymentAmount` from `LP_CONFIGS` + fresh `lp-everpro-rates` rates
> and ignores the browser amount. The callback is handled by the same function
> at `?action=callback`, so no separate callback function is required. The
> findings below describe the pre-fix state; deploy the updated
> `duitku-lp-order` to close the payment-page gap in production.

Scope: static LP (`index.html`, `js/main.js`) and Supabase Edge Functions
`lp-everpro-rates`, `lp-everpro-create-order`, plus the shared
`duitku-lp-order` endpoint used by the LP.

## Verdict

- **Shipment creation is protected.** A manipulated frontend cannot create an
  Everpro order at a fake price or fake shipping cost.
- **The Duitku payment page is not fully protected.** `duitku-lp-order` accepts
  the `amount` sent by the browser. A manipulated request can create a cheap
  Duitku payment page. The shipment gatekeeper rejects the mismatch, so the
  attacker cannot get goods, but the payment amount must be fixed before
  production.
- **No SQL injection or XSS found** in the audited LP code.
- **No secret is exposed** in the browser bundle.

## Evidence

A sandbox probe was sent to `duitku-lp-order` with `amount: 1000`. The function
returned a sandbox payment URL with `amount: "1000"`:

```json
{
  "success": true,
  "order_number": "LP-TINYHONEY-1792552531616-297",
  "environment": "sandbox",
  "duitku": {
    "reference": "DS3088126UB5A0W1P3PSKO07",
    "paymentUrl": "https://sandbox.duitku.com/topup/topupdirectv2.aspx?ref=...",
    "amount": "1000",
    "statusCode": "00"
  }
}
```

This proves the shared function trusts the client amount. The probe was not
paid. It is a sandbox transaction and will expire.

The same order number was sent to `lp-everpro-create-order`; it was rejected
before shipment creation:

```json
{
  "success": false,
  "error": "Pembayaran belum berhasil (resultCode=01)."
}
```

This confirms the gatekeeper refuses an unpaid transaction.

## What is protected by `lp-everpro-create-order`

- Duitku `transactionStatus` must be `resultCode = 00`.
- `merchantOrderId` must match `order_number`.
- `reference` must match the Duitku reference.
- Duitku `amount` must equal the server-calculated total.
- Product price and weight come from `LP_CONFIGS`, not the browser.
- Shipping is re-fetched from Everpro using the server's origin, dimensions,
  weight, and item price.
- The selected `rate_code` must exist in the fresh rates response.
- Cargo/vehicle groups are rejected.
- `client_order_no = order_number` makes creation idempotent.
- Pickup time and shipper data are server-side.

## What is not protected

1. **Duitku amount** — resolved in repo by `duitku-lp-order`
   (`2026-10-21-server-amount-env`); deploy pending.
2. **Checkout snapshot** — `duitku-lp-order` now writes the snapshot, but
   create-order still accepts receiver data from the request body. A leaked
   order number + reference could be replayed with a different address if the
   shipping cost matches.
3. **Cross-LP replay** — if several LPs share the same Duitku merchant, an order
   from another LP with the same amount and shipping could be reused.
4. **Rate display** — the old `lp-everpro-rates` build trusted client weight,
   dimensions, item price, and origin. The repo now hardens this with
   `LP_CONFIGS` (`2026-10-21-promo-env`); it must be deployed.

## Recommended fix order

1. ~~Patch the payment function or create a new one~~ **Done in repo:** the
   existing `duitku-lp-order` resolves `lp_slug` + `quantity` + `rate_code`,
   computes product + shipping server-side, ignores `body.amount`, and creates
   the Duitku transaction with the computed amount. No new function name.
2. Add `lp_orders` (see `supabase/sql/lp_orders.sql`) and store the checkout
   snapshot before redirecting to Duitku. **Done in repo:** `duitku-lp-order`
   writes the snapshot best-effort.
3. Update `lp-everpro-create-order` to read the snapshot by `order_number`
   instead of trusting receiver data from the request body. **Still pending.**
4. Deploy `lp-everpro-rates` `2026-10-21-promo-env`.
5. Deploy `lp-everpro-create-order` `2026-10-21-promo-env`.
6. Deploy the updated `duitku-lp-order`
   (`2026-10-21-server-amount-env`). The callback uses the same function at
   `?action=callback`.
7. Publish the LP with `js/main.js?v=20261021-10` and
   `css/styles.css?v=20261021-4`.

## Reproduction (sandbox only)

Do not run this against production. It creates a payment page.

```bash
curl -X POST "https://<project>.supabase.co/functions/v1/duitku-lp-order" \
  -H "Content-Type: application/json" \
  -d '{
    "product_name": "Probe",
    "amount": 1000,
    "quantity": 1,
    "customer_name": "Probe",
    "phone": "081234567890",
    "address": "Jl. Test",
    "payment_method": "SP",
    "landing_page_source": "tinyhoney",
    "return_url": "https://example.com"
  }'
```

Expected after the fix: the response amount must be the server-calculated total,
not `1000`, or the request must be rejected.
