# TinyHoney LP — Supabase Edge Functions

> **Read the reusable integration guide first:**
> [`docs/LP-INTEGRATION-GUIDE.md`](../docs/LP-INTEGRATION-GUIDE.md). It contains
> the architecture, endpoint contracts, security invariants, and the checklist
> for onboarding the next landing page.

> **Important:** Deploy the functions below before publishing the updated LP. The
> old `lp-everpro-create-order` did not verify the Duitku payment. Overwrite it
> with the code in this folder first, then publish the static site.

> **Known gap closed for this LP (after deployment):** the LP calls the existing
> `duitku-lp-order` function, which now recomputes the product price, promo,
> fresh Everpro shipping rate, and Duitku `paymentAmount` on the server. The old
> version trusted the browser `amount`; replace it with the version in this
> repository. No new payment function name is needed.

These functions are isolated from the main webstore functions:

- `lp-everpro-rates` — province/city/district/subdistrict lookup still uses the existing `everpro-*` functions; rates now use this LP-specific function. For a known `lp_slug`, it resolves weight, dimensions, item price, origin, and shipment type from `LP_CONFIGS`; the browser only sends `quantity`, destination, and courier filters.
- `lp-everpro-create-order` — verifies the Duitku payment, recalculates the rate, and creates the Everpro shipment order.
- `duitku-lp-order` — recomputes the product total, promo, and **fresh** shipping cost server-side, then creates the Duitku v2 inquiry. The browser amount is ignored. The same function handles the Duitku callback at `?action=callback`, so no separate callback function is required.

## Security flow

1. The LP sends the destination and selected courier to the browser.
2. The browser asks `duitku-lp-order` to create the payment. That function:
   - recomputes `quantity × unitPrice` from `LP_CONFIGS`;
   - calls `lp-everpro-rates` again for the selected `rate_code`;
   - applies the promo to the product value, not to Everpro `shipment_price`;
   - sends the server-calculated `paymentAmount` to Duitku.
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

### Server-side package config

For a known `lp_slug`, `lp-everpro-rates` ignores the client's `weight`,
`item_price`, `width`, `height`, `length`, `origin_postal_code`,
`origin_sub_district_name`, and `shipment_type`. It computes them from
`LP_CONFIGS` so a modified browser cannot request a fake cheap rate.

Keep `LP_CONFIGS` in `lp-everpro-rates` and `lp-everpro-create-order` in sync.
When adding a new LP, add the same product values to both functions.

### Courier services

The LP only offers `regular`, `express`, `same_day`, and `instant` rates. Cargo
and vehicle services are excluded because they often reject AWB generation for
small parcels such as TinyHoney. The create-order function applies the same
filter server-side, including to flat array responses from Everpro.

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
DUITKU_ENV=sandbox                          # optional; also detected from DUITKU_API_URL
DUITKU_API_URL=https://sandbox.duitku.com   # v2 inquiry + transactionStatus
DUITKU_CALLBACK_URL=https://<project>.supabase.co/functions/v1/duitku-lp-order?action=callback  # optional; this is the default
DUITKU_DEFAULT_EMAIL=admin@tinyhoney.id     # optional
DUITKU_EXPIRY_MINUTES=60                    # optional
DUITKU_API_VERSION=v2                       # optional; v2 is the default
```

`duitku-lp-order` uses Duitku v2 (`sandbox.duitku.com` /
`passport.duitku.com`). `DUITKU_API_URL` is used by both
`duitku-lp-order` and `lp-everpro-create-order` to create the payment and call
`transactionStatus`. If `DUITKU_CALLBACK_URL` is omitted, the function uses the
same endpoint with `?action=callback`, so no separate callback function is
needed.

If the project ever uses the legacy Duitku v1 API for the status check, set:

```text
DUITKU_API_URL=https://api-sandbox.duitku.com
DUITKU_API_VERSION=v1
```

The function supports both signature modes:

- v2: HMAC-SHA256(`merchantCode + merchantOrderId`, `apiKey`)
- v1: MD5(`merchantCode + merchantOrderId + apiKey`)

Optional product overrides:

```text
LP_TINYHONEY_UNIT_PRICE=99000
LP_TINYHONEY_FREE_SHIPPING_MAX=10000
LP_TINYHONEY_SHIPPING_PROMO_MIN_QTY=2
LP_TINYHONEY_WEIGHT_GRAM=175
LP_TINYHONEY_LENGTH_CM=6
LP_TINYHONEY_WIDTH_CM=6
LP_TINYHONEY_HEIGHT_CM=11
LP_TINYHONEY_PRODUCT_NAME=TinyHoney
```

The defaults already match the current LP. Keep the LP's
`CHECKOUT_CONFIG.unitPrice`, `freeShippingMax`, and
`freeShippingMinQuantity` in sync with these values.

> `LP_TINYHONEY_FREE_SHIPPING_MAX` adalah nama env yang sudah ada di Supabase.
> Set nilainya ke `10000`. Kalau nilainya kosong atau `0`, function memakai
> fallback `10000` agar promo tidak mati tanpa sengaja. Tidak ada env promo
> baru; env yang dipakai tetap `LP_TINYHONEY_FREE_SHIPPING_MAX` dan
> `LP_TINYHONEY_SHIPPING_PROMO_MIN_QTY`.

`duitku-lp-order` **tidak menambah env wajib**. Function ini memakai env Duitku
yang sudah ada (`DUITKU_MERCHANT_CODE`, `DUITKU_API_KEY`, `DUITKU_API_URL`).
Env opsional: `DUITKU_CALLBACK_URL` (default otomatis ke
`<SUPABASE_URL>/functions/v1/duitku-lp-order?action=callback`) dan
`DUITKU_DEFAULT_EMAIL` (default `admin@tinyhoney.id`). `SUPABASE_URL` dan
`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY` disediakan otomatis oleh
Supabase.

### Shipping promo

The current promo is:

- **100% shipping discount**, capped at **Rp10.000**;
- **minimum 2 bottles**;
- shown to the buyer as `Diskon Ongkir`;
- applied to the **product value** in the Everpro payload
  (`package_price = productTotal - discount`), not to `shipment_price`.

Why not reduce `shipment_price`? Everpro validates `signed_key` against the
rate it quoted. Reducing `shipment_price` makes the create-order signature
invalid. The function therefore:

1. fetches rates with the normal product total to discover the shipping cost;
2. calculates the promo discount and `package_price`;
3. if the promo applies, re-fetches rates with `item_price = package_price`;
4. verifies the shipping price is unchanged;
5. creates the Everpro order with the new `package_price` and the original
   shipping price.

The buyer still pays `productTotal + shippingCost - discount`, which equals
`package_price + shippingCost`. If the client and server promo values differ,
`lp-everpro-create-order` rejects the order with
`Nominal pembayaran tidak cocok`.

## Deploy

Current build markers:

- `lp-everpro-rates`: `2026-10-21-promo-env`
- `lp-everpro-create-order`: `2026-10-21-promo-env`
- `duitku-lp-order`: `2026-10-21-server-amount-env`
- Client: `js/main.js?v=20261021-10`, `css/styles.css?v=20261021-4`

From the repository root:

```bash
supabase functions deploy lp-everpro-rates --no-verify-jwt
supabase functions deploy lp-everpro-create-order --no-verify-jwt
supabase functions deploy duitku-lp-order --no-verify-jwt
```

If the functions are managed from the Supabase Dashboard, paste the contents of each `index.ts` into the corresponding function editor and deploy.

> **Dashboard setting:** set **Verify JWT** to **off** for
> `lp-everpro-rates`, `lp-everpro-create-order`, and `duitku-lp-order`. The LP
> calls these from the browser, and Duitku calls the callback without a
> Supabase JWT.

> **Deploy order:** deploy `lp-everpro-rates` and `lp-everpro-create-order`
> first, then update the existing `duitku-lp-order` function, then publish the
> LP. The payment function calls `lp-everpro-rates`, so it must exist before a
> buyer opens checkout.
>
> **Price sync:** set `LP_TINYHONEY_UNIT_PRICE=99000` and publish the LP with
> `js/main.js?v=20261021-10` at the same time. If the client and server prices
> differ, `lp-everpro-create-order` rejects the order with
> `Nominal pembayaran tidak cocok`. Existing open tabs may need a hard refresh.

## Callback endpoint

The **Duitku payment callback** is handled by `duitku-lp-order` at
`?action=callback`. It verifies
`HMAC-SHA256(merchantCode + amount + merchantOrderId, apiKey)` and returns
`SUCCESS` with HTTP 200. It is informational only: `lp-everpro-create-order`
still verifies the transaction with `transactionStatus` before creating a
shipment.

`lp-everpro-awb-callback` and `lp-everpro-tracking-callback` are **Everpro webhooks**, not LP endpoints.

- `awb-callback` receives AWB generation/update events.
- `tracking-callback` receives tracking status updates.
- Both must verify a callback key (they currently return `401 Unauthorized callback key` without it).
- They only make sense once LP orders are persisted in a table. For now the LP does not depend on them; the admin can generate AWB and request pickup from the Everpro dashboard.

The optional `lp_orders` snapshot schema is in
[`sql/lp_orders.sql`](sql/lp_orders.sql). `duitku-lp-order` writes the snapshot
and its callback mode marks it paid; `lp-everpro-create-order` still verifies
the payment independently. Future improvement: have the Everpro callbacks
update `everpro_order_no`, `awb_number`, and `tracking_status`, then optionally
trigger a WhatsApp notification.
