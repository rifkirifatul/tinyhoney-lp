# TinyHoney LP — Agent Notes

This repository is a static landing page with Supabase Edge Functions for
Duitku payments and Everpro shipping.

**Before changing checkout, pricing, shipping, or payment code, read
[`docs/LP-INTEGRATION-GUIDE.md`](docs/LP-INTEGRATION-GUIDE.md).**

## Non-negotiable rules

1. The browser is untrusted. Never use client-supplied prices, weights,
   dimensions, shipping costs, or payment amounts as the source of truth.
2. Product price, weight, dimensions, origin, shipper, shipping promo cap and
   minimum quantity, and allowed courier groups live in the Edge Function
   (`LP_CONFIGS` / env).
3. `lp-everpro-create-order` must keep verifying:
   - Duitku `transactionStatus` with `resultCode = 00`;
   - `merchantOrderId` and `reference`;
   - paid `amount` equals the server-calculated total;
   - the selected `rate_code` exists in freshly fetched Everpro rates;
   - `client_order_no = order_number` for idempotency.
4. Never put Everpro/Duitku secrets in `js/main.js`, HTML, or any public file.
5. Keep client and server values in sync: `unitPrice`, `weightPerItemGram`,
   dimensions, `freeShippingMax`, `freeShippingMinQuantity`, and
   `shipmentType`.
6. TinyHoney only offers `regular`, `express`, `same_day`, and `instant`.
   Cargo/vehicle services are blocked because they often fail AWB generation.
7. The shipping promo is 100% off, capped at Rp10.000, minimum 2 bottles. Apply
   the discount to Everpro `package_price`, never to `shipment_price`. Re-fetch
   rates with the discounted `item_price` so `signed_key` stays valid.
8. After editing `js/main.js`, bump the cache-bust in `index.html`
   (`js/main.js?v=...`). After editing an Edge Function, bump `FUNCTION_BUILD`.
9. The LP must call the existing `duitku-lp-order`, which computes the Duitku
   `paymentAmount` server-side from `LP_CONFIGS` + fresh `lp-everpro-rates`
   rates. Do not create a second payment function with a different name. The
   same function handles Duitku callbacks at `?action=callback`; no separate
   callback function is required.
10. The LP exposes one generic `QRIS` option. `duitku-lp-order` resolves the
    active QRIS channel via `getpaymentmethod` (prefer `NQ`, then `SQ`, then
    `SP`); never hard-code `SP`, which can hang in sandbox.

## Adding a new LP

Follow §6 of `docs/LP-INTEGRATION-GUIDE.md`. In short:

1. Add one `LP_CONFIGS` entry in `lp-everpro-rates`,
   `lp-everpro-create-order`, and `duitku-lp-order`.
2. Add `LP_<SLUG>_*` env vars and Everpro/Duitku secrets.
3. Add the client config with `landingPageSource` matching the config key.
4. Compute the Duitku amount server-side (`duitku-lp-order` does this).
5. Store an order snapshot in `lp_orders` (recommended).
6. Deploy functions, publish the LP with a new cache-bust, and test rates + one
   small transaction through AWB.

## Useful commands

```powershell
# Syntax check the browser bundle
node --check js/main.js

# Syntax check an Edge Function
npx --yes esbuild supabase/functions/lp-everpro-create-order/index.ts --bundle --platform=neutral --format=esm --external:https://* --outfile="$env:TEMP\lp-check.js"

# Git
git status
git log --oneline -5
```
