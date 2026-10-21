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
   - chooses the `pickup_time` server-side (the buyer never selects a pickup slot);
   - creates the Everpro order using the server-side shipper data;
   - is idempotent by using the Duitku order number as Everpro `client_order_no`.
5. The buyer is then redirected to WhatsApp with the order number, Everpro order number, and AWB if available.

### Pickup time

Everpro requires `pickup_time` when creating an order. The function resolves it
automatically:

1. It calls Everpro's `GET /shipment/v1/pickup-times` for the selected
   `rate_code`, using `Asia/Jakarta`.
2. It uses the earliest future slot returned, formatted as an RFC3339 string.
3. If no slot is available (or the lookup fails), it falls back to the next day
   at 10:00 Asia/Jakarta, skipping Sunday, also formatted as RFC3339.

The admin can still adjust the pickup schedule from the Everpro dashboard. No
pickup-time input is shown to the buyer.

### Shipment type

The LP currently uses `PICKUP`: the courier picks up the parcel from the
TinyHoney warehouse. This value must match in two places:

- `EVERPRO_CONFIG.shipmentType` in `js/main.js` (used for rate lookup)
- `LP_CONFIGS.tinyhoney.shipmentType` in `lp-everpro-create-order` (used for
  order creation)

To switch to `DROP`, change both values to `DROP`, redeploy the function, and
publish the LP. Rates and the paid amount must be recalculated after switching.

### Courier services

The LP only offers `regular`, `express`, `same_day`, and `instant` rates. Cargo
and vehicle services are excluded because they often reject AWB generation for
small parcels such as TinyHoney. The create-order function applies the same
filter server-side.

### Everpro signed_key

Everpro validates `signed_key` against the values used by get-rates. The
create-order payload must therefore reuse the same values:

- `weight` in kilograms in both get-rates and create-order. The LP sends grams,
  so the functions convert with `weightGram / 1000`;
- `shipment_price` equals the raw rates response `price`, which is already in
  Rupiah;
- `cashback`, `min_duration`, `max_duration`, `is_flat_rate`, and
  `insurance_price` from the selected rates response;
- `package_price` equal to the get-rates `item_price`.

Do not divide the rates `price` by 100: it is Rupiah, not cents. Duitku uses the
same Rupiah amount for payment verification.

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
LP_TINYHONEY_FREE_SHIPPING_MAX=0
LP_TINYHONEY_WEIGHT_GRAM=175
LP_TINYHONEY_LENGTH_CM=6
LP_TINYHONEY_WIDTH_CM=6
LP_TINYHONEY_HEIGHT_CM=11
LP_TINYHONEY_PRODUCT_NAME=TinyHoney
```

The defaults already match the current LP. Keep the LP's `CHECKOUT_CONFIG.unitPrice` and `freeShippingMax` in sync with these values.

### Free-shipping promo

The free-shipping promo is **currently disabled**:

- `LP_TINYHONEY_FREE_SHIPPING_MAX=0`
- `CHECKOUT_CONFIG.freeShippingMax = 0` in `js/main.js`

The promotional copy can stay on the landing page, but no shipping discount is applied to the amount. To re-enable it later, set both values to the same cap (for example `30000`) and redeploy the function.

Buyers pay the shipping cost added by the server. If the client and server caps differ, `lp-everpro-create-order` rejects the order with `Nominal pembayaran tidak cocok` to prevent underpayment.

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
