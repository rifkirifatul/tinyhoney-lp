# TinyHoney LP — Supabase Edge Functions

> **Important:** Deploy both functions before publishing the updated LP. The old
> `lp-everpro-create-order` did not verify the Duitku payment. Overwrite it with
> the code in this folder first, then publish the static site.

These functions are isolated from the main webstore functions:

- `lp-everpro-rates` — province/city/district/subdistrict lookup still uses the existing `everpro-*` functions; rates now use this LP-specific function.
- `lp-everpro-create-order` — verifies the Duitku payment, recalculates the rate, and creates the Everpro shipment order.

## Security flow

1. The LP sends the destination and selected courier to the browser.
2. The browser creates a Duitku transaction through `duitku-lp-order`.
3. After Duitku redirects back with `resultCode=00`, the LP calls `lp-everpro-create-order`.
4. `lp-everpro-create-order` **does not trust client prices**. It:
   - verifies the transaction with Duitku `transactionStatus`;
   - checks that the paid amount matches the server-calculated product + shipping total;
   - re-fetches rates from Everpro and matches the selected `rate_code`;
   - creates the Everpro order using the server-side shipper data;
   - is idempotent by using the Duitku order number as Everpro `client_order_no`.
5. The buyer is then redirected to WhatsApp with the order number, Everpro order number, and AWB if available.

If payment verification or Everpro creation fails, the buyer is still redirected to WhatsApp with a note that the shipment will be created manually by the admin. No unpaid order can be created.

## Required Supabase secrets

Set these in **Project Settings → Edge Functions → Secrets** (or with `supabase secrets set`):

```text
EVERPRO_LP_CLIENT_KEY=...
EVERPRO_LP_CLIENT_SECRET=...
EVERPRO_LP_API_URL=https://...        # LP-specific Everpro base URL (sandbox or production)

SHIPPER_NAME=TinyHoney
SHIPPER_PHONE=628xxxxxxxxxx
SHIPPER_ADDRESS=Jl. Saturnus Tengah I No. 1, Manjahlega, Rancasari, Kota Bandung, Jawa Barat 40286
SHIPPER_POSTAL_CODE=40286
SHIPPER_SUB_DISTRICT_NAME=Manjahlega

DUITKU_MERCHANT_CODE=...
DUITKU_API_KEY=...
DUITKU_API_URL=https://sandbox.duitku.com   # or https://passport.duitku.com
DUITKU_API_VERSION=v2                       # optional; v2 is the default
```

`duitku-lp-order` currently uses Duitku v2 (`sandbox.duitku.com` / `passport.duitku.com`), so these defaults match it. `DUITKU_API_URL` can be omitted if `DUITKU_ENV=production` or `DUITKU_IS_PRODUCTION=true` is set.

If the project ever uses the legacy Duitku v1 API, set:

```text
DUITKU_API_URL=https://api-sandbox.duitku.com
DUITKU_API_VERSION=v1
```

The function supports both signature modes:

- v2: HMAC-SHA256(`merchantCode + merchantOrderId`, `apiKey`)
- v1: MD5(`merchantCode + merchantOrderId + apiKey`)

Optional product overrides:

```text
LP_TINYHONEY_UNIT_PRICE=129000
LP_TINYHONEY_FREE_SHIPPING_MAX=30000
LP_TINYHONEY_WEIGHT_GRAM=175
LP_TINYHONEY_LENGTH_CM=6
LP_TINYHONEY_WIDTH_CM=6
LP_TINYHONEY_HEIGHT_CM=11
LP_TINYHONEY_PRODUCT_NAME=TinyHoney
```

The defaults already match the current LP. Keep the LP's `CHECKOUT_CONFIG.unitPrice` and `freeShippingMax` in sync with these values.

## Deploy

From the repository root:

```bash
supabase functions deploy lp-everpro-rates --no-verify-jwt
supabase functions deploy lp-everpro-create-order --no-verify-jwt
```

If the functions are managed from the Supabase Dashboard, paste the contents of each `index.ts` into the corresponding function editor and deploy.

## Callback endpoints

`lp-everpro-awb-callback` and `lp-everpro-tracking-callback` are **Everpro webhooks**, not LP endpoints.

- `awb-callback` receives AWB generation/update events.
- `tracking-callback` receives tracking status updates.
- Both must verify a callback key (they currently return `401 Unauthorized callback key` without it).
- They only make sense once LP orders are persisted in a table. For now the LP does not depend on them; the admin can generate AWB and request pickup from the Everpro dashboard.

Future improvement: add an `lp_orders` table with `order_number`, `everpro_order_no`, `awb_number`, `tracking_status`, and `buyer_phone`, then have the callbacks update that table and optionally trigger a WhatsApp notification.
