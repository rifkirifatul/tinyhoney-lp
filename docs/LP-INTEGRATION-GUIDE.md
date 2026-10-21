# Panduan Integrasi LP → Duitku → Everpro

Dokumen ini adalah blueprint untuk semua landing page (LP) yang memakai
Duitku + Everpro lewat Supabase Edge Functions. TinyHoney adalah implementasi
pertama. Gunakan dokumen ini saat menambah LP baru agar pola keamanan, kontrak
endpoint, dan langkah deploy tidak diulang dari nol.

> **Baca ini dulu sebelum mengubah checkout, harga, ongkir, atau fungsi
> pembayaran.** Frontend tidak boleh dipercaya untuk nominal apa pun.

---

## 1. Arsitektur

```text
Browser (static LP)
  │
  ├─ POST lp-everpro-rates
  │    → server resolves LP config (harga, berat, dimensi, origin)
  │    → Everpro /shipment/v2/rates
  │    → daftar kurir + harga untuk ditampilkan
  │
  ├─ POST duitku-lp-order / lp-duitku-order
  │    → server menghitung ulang produk + ongkir
  │    → membuat transaksi Duitku
  │    → menyimpan snapshot order (disarankan)
  │
  ├─ redirect ke halaman pembayaran Duitku
  │
  ├─ Duitku redirect balik ke LP (?resultCode=00)
  │
  ├─ POST lp-everpro-create-order
  │    → verifikasi status transaksi ke Duitku
  │    → cocokkan amount + reference
  │    → hitung ulang rates Everpro
  │    → pilih rate_code yang sama
  │    → buat order Everpro (idempotent)
  │
  └─ redirect ke WhatsApp admin
```

Prinsip pemisahan:

- **LP statis** hanya untuk tampilan dan input pembeli.
- **Edge Function** adalah satu-satunya tempat yang boleh menentukan harga,
  berat, dimensi, origin, kurir yang diizinkan, dan nominal pembayaran.
- **Rahasia API** (Everpro, Duitku, service role) hanya ada di Supabase
  secrets. Tidak pernah masuk ke `js/main.js` atau HTML.

---

## 2. Source of truth

| Data | Disimpan di | Boleh diubah dari browser? |
|---|---|---|
| Harga produk | `LP_CONFIGS` di Edge Function / env `LP_<SLUG>_UNIT_PRICE` | Tidak |
| Berat per item | `LP_CONFIGS` / env `LP_<SLUG>_WEIGHT_GRAM` | Tidak |
| Dimensi | `LP_CONFIGS` / env | Tidak |
| Origin/shipper | env `SHIPPER_*` atau config LP | Tidak |
| Free shipping | `LP_CONFIGS` / env | Tidak |
| Ongkir | Everpro rates, dihitung ulang server | Tidak |
| Kurir yang boleh dipilih | filter grup di server | Tidak |
| Nominal Duitku | **harus** dihitung server sebelum create transaction | Saat ini belum (lihat §5) |
| Data penerima | input pembeli, divalidasi server | Ya, tapi harus di-bind ke order |
| Status pembayaran | Duitku `transactionStatus` | Tidak |

---

## 3. Alur transaksi yang benar

1. Pembeli isi alamat dan jumlah.
2. LP minta ongkir ke `lp-everpro-rates`.
3. Pembeli pilih kurir.
4. LP minta **server** membuat transaksi Duitku. Server menghitung:
   ```text
   product_total = quantity × unit_price
   shipping_paid = shipping_cost - shipping_discount
   amount        = product_total + shipping_paid
   ```
5. Server menyimpan snapshot checkout (order number, amount, alamat, rate_code,
   quantity, lp_slug) ke tabel `lp_orders`.
6. Pembeli bayar di Duitku.
7. Duitku redirect ke LP dengan `merchantOrderId`, `resultCode`, `reference`.
8. LP memanggil `lp-everpro-create-order`.
9. Fungsi itu:
   - cek `transactionStatus` ke Duitku;
   - pastikan `resultCode = 00`;
   - pastikan `reference` sama;
   - pastikan `amount` sama dengan total server;
   - ambil snapshot order dari `lp_orders` (bukan dari body request);
   - hitung ulang rates Everpro dan cocokkan `rate_code`;
   - buat order Everpro dengan `client_order_no = order_number`;
   - update `lp_orders` dengan `everpro_order_no`, `awb`, `status`.
10. LP redirect ke WhatsApp admin.

Jika langkah 9 gagal, pembeli tetap diarahkan ke WhatsApp dengan catatan bahwa
admin akan membuat order pengiriman manual. Tidak ada order Everpro yang dibuat
untuk pembayaran yang belum sah.

---

## 4. Kontrak endpoint

### 4.1 `lp-everpro-rates`

**Tujuan:** menghitung ongkir untuk ditampilkan.

Request yang disarankan:

```json
{
  "lp_slug": "tinyhoney",
  "quantity": 1,
  "destination_postal_code": "40286",
  "destination_sub_district_name": "Manjahlega"
}
```

Server harus mengabaikan `weight`, `length`, `width`, `height`, `item_price`,
`origin_postal_code`, dan `shipment_type` dari client untuk LP yang sudah
dikenal. Nilai-nilai itu diambil dari `LP_CONFIGS`.

Response: respons Everpro apa adanya (`data.regular`, `data.express`,
`data.same_day`, `data.instant`, `data.cargo`, `data.vehicle`).

Catatan keamanan:

- Versi terbaru (`2026-10-21-server-config`) sudah mengabaikan `weight`,
  dimensi, `item_price`, origin, dan `shipment_type` dari client untuk LP yang
  dikenal. Nilainya diambil dari `LP_CONFIGS`. Pastikan build ini yang
  ter-deploy; build lama masih memakai nilai client.
- Filter grup kurir di client **dan** server. TinyHoney hanya menampilkan
  `regular`, `express`, `same_day`, `instant`. `cargo`/`vehicle` diblokir
  karena sering gagal AWB untuk paket kecil.

### 4.2 `duitku-lp-order` / `lp-duitku-order`

**Tujuan:** membuat transaksi Duitku.

Request yang disarankan:

```json
{
  "lp_slug": "tinyhoney",
  "quantity": 1,
  "payment_method": "SP",
  "rate_code": "UDRREG",
  "courier_name": "SAP Logistic",
  "courier_service": "Regular",
  "customer_name": "Nama",
  "phone": "08...",
  "address": "Alamat lengkap",
  "postal_code": "40286",
  "sub_district_name": "Manjahlega",
  "district_name": "Rancasari",
  "city_name": "Kota Bandung",
  "province_name": "Jawa Barat"
}
```

Server **wajib** menghitung `amount` sendiri:

```text
quantity × unit_price + (shipping_cost - shipping_discount)
```

Jangan memakai `body.amount` dari browser.

Response:

```json
{
  "success": true,
  "order_number": "LP-TINYHONEY-...",
  "duitku": {
    "reference": "...",
    "paymentUrl": "https://sandbox.duitku.com/...",
    "amount": "134000"
  }
}
```

**Status TinyHoney:** `duitku-lp-order` saat ini masih memakai `amount` dari
client. Ini sudah diuji dan terbukti bisa membuat transaksi sandbox Rp1.000.
Lihat §5 untuk rekomendasi perbaikan.

### 4.3 `lp-everpro-create-order`

**Tujuan:** membuat order pengiriman setelah pembayaran sah.

Request minimal:

```json
{
  "order_number": "LP-TINYHONEY-...",
  "reference": "REF-DUITKU",
  "lp_slug": "tinyhoney",
  "quantity": 1,
  "rate_code": "UDRREG",
  "courier_name": "SAP Logistic",
  "courier_service": "Regular",
  "receiver_name": "Nama",
  "receiver_phone": "08...",
  "receiver_address": "Alamat lengkap",
  "receiver_postal_code": "40286",
  "receiver_sub_district_name": "Manjahlega"
}
```

Verifikasi server (urutan penting):

1. `order_number` regex `^[A-Za-z0-9._-]+$`.
2. `quantity` 1–99.
3. Duitku `transactionStatus`: `resultCode = 00`.
4. `merchantOrderId` cocok.
5. `reference` cocok.
6. `amount` Duitku = `quantity × server_unit_price + server_shipping`.
7. `rate_code` ada di rates Everpro yang dihitung ulang.
8. `signed_key` ada.
9. `pickup_time` dipilih server (RFC3339, skip Minggu).
10. `client_order_no = order_number` untuk idempotensi.
11. Jika order Everpro sudah ada, kembalikan order yang sama.

Response sukses:

```json
{
  "success": true,
  "order_number": "LP-TINYHONEY-...",
  "everpro_order_no": "...",
  "awb": "...",
  "tracking_url": "...",
  "shipping": {
    "courier_name": "SAP Logistic",
    "courier_service": "Regular",
    "rate_code": "UDRREG",
    "cost": 5000,
    "discount": 0,
    "paid": 5000
  }
}
```

### 4.4 Callback Everpro

- `everpro-awb-callback`: event AWB.
- `everpro-tracking-callback`: event tracking.
- Keduanya webhook, bukan endpoint LP.
- Wajib punya callback key.
- Baru berguna jika order disimpan di `lp_orders`; callback bisa update
  `awb`, `tracking_status`, dan `updated_at`.

---

## 5. Audit keamanan TinyHoney

Bukti probe dan detail temuan: [`SECURITY-AUDIT-2026-10-21.md`](SECURITY-AUDIT-2026-10-21.md).

### Sudah aman

- **Harga produk, berat, dimensi, origin, shipper, free shipping** dihitung di
  `lp-everpro-create-order`, bukan dari body request.
- **Ongkir** dihitung ulang dari Everpro saat create-order. `rate_code` harus
  ada di response rates yang baru.
- **Pembayaran** diverifikasi ke Duitku, termasuk `resultCode`, `reference`,
  dan `amount`.
- **Order tanpa pembayaran** ditolak (`402`) — sudah diuji.
- **Order dengan amount tidak cocok** ditolak (`402`).
- **Idempotensi** memakai `client_order_no = order_number`.
- **Kurir cargo/vehicle** difilter di client dan server.
- **Tidak ada rahasia** Everpro/Duitku di browser.
- **Tidak ada SQL injection**: query Supabase memakai parameter.
- **Tidak ada XSS**: input pembeli dirender dengan `textContent` atau dikirim
  sebagai JSON; `innerHTML` hanya untuk markup statis.
- **Order number** dibatasi regex; `reference` disanitasi sebelum dikirim ke
  Everpro.
- **Tidak ada open redirect**: `return_url` memakai origin + pathname LP.

### Gap yang harus ditutup sebelum production

1. **Nominal Duitku masih dari client.**
   - `duitku-lp-order` menerima `amount` dari browser.
   - Bukti: request dengan `amount: 1000` menghasilkan payment URL sandbox
     Rp1.000.
   - Dampak: pembeli bisa membuat halaman pembayaran murah. Order Everpro tetap
     ditolak karena amount tidak cocok, jadi **tidak bisa mendapat barang**
     dengan harga palsu. Tapi ini tetap masalah integritas pembayaran dan CS.
   - Perbaikan: hitung amount di server sebelum create transaction, atau buat
     `lp-duitku-order` khusus LP yang memakai `LP_CONFIGS`.

2. **Snapshot order belum disimpan.**
   - `lp-everpro-create-order` memakai data penerima dari body request.
   - Jika order number + reference bocor, alamat bisa diganti selama ongkirnya
     sama.
   - Perbaikan: simpan snapshot di `lp_orders` saat create transaction, lalu
     create-order memakai snapshot itu.

3. **`lp-everpro-rates` versi lama masih menerima berat/dimensi/harga dari
   client.**
   - Dampak hanya pada tampilan ongkir; create-order menghitung ulang.
   - Sudah diperbaiki di repo: build `2026-10-21-server-config` memakai
     `lp_slug` + `quantity` + `LP_CONFIGS`. Tinggal deploy ulang.

4. **Cross-LP replay.**
   - Jika beberapa LP memakai merchant Duitku yang sama, order dari LP lain
     dengan amount + ongkir kebetulan sama bisa dipakai untuk LP ini.
   - Perbaikan: simpan `lp_slug` di `lp_orders` dan cocokkan saat create-order.

### Matriks tes manual

| Tes | Hasil yang benar |
|---|---|
| Ubah teks harga di Inspect Element | Halaman Duitku tetap nominal asli (karena hanya DOM) |
| Ubah `CHECKOUT_CONFIG.unitPrice` di console | Halaman Duitku bisa berubah (gap §5.1); create-order harus menolak |
| Kirim `amount` kecil ke `duitku-lp-order` | Saat ini membuat transaksi murah (gap); create-order menolak |
| Panggil `lp-everpro-create-order` tanpa bayar | `402 Pembayaran belum berhasil` |
| Bayar, lalu ubah `quantity` | `402 Nominal pembayaran tidak cocok` |
| Pilih `rate_code` cargo | `409 Kurir tidak tersedia` |
| Panggil create-order dua kali | Response `already_exists: true`, tidak ada order ganda |
| Isi nama/alamat dengan `<script>` | Tidak dieksekusi; tampil sebagai teks / dikirim sebagai JSON |

---

## 6. Cara menambah LP baru

### Langkah 1 — tambah config di Edge Function

Di `supabase/functions/lp-everpro-create-order/index.ts`, tambah entry baru di
`LP_CONFIGS`:

```ts
newlp: {
  unitPrice: envInt("LP_NEWLP_UNIT_PRICE", 99000),
  freeShippingMax: envInt("LP_NEWLP_FREE_SHIPPING_MAX", 0),
  weightPerItemGram: envInt("LP_NEWLP_WEIGHT_GRAM", 300),
  lengthCm: envInt("LP_NEWLP_LENGTH_CM", 10),
  widthCm: envInt("LP_NEWLP_WIDTH_CM", 10),
  heightCm: envInt("LP_NEWLP_HEIGHT_CM", 10),
  productName: Deno.env.get("LP_NEWLP_PRODUCT_NAME") || "Produk Baru",
  packageTypeId: 1,
  shipmentType: "PICKUP",
},
```

Nilai default harus sama dengan yang ada di `js/main.js` LP baru. Jangan
mengandalkan nilai dari client.

### Langkah 2 — siapkan secrets

```text
EVERPRO_LP_CLIENT_KEY=...
EVERPRO_LP_CLIENT_SECRET=...
EVERPRO_LP_API_URL=https://...

SHIPPER_NAME=...
SHIPPER_PHONE=...
SHIPPER_ADDRESS=...
SHIPPER_POSTAL_CODE=...
SHIPPER_SUB_DISTRICT_NAME=...

DUITKU_MERCHANT_CODE=...
DUITKU_API_KEY=...
DUITKU_API_URL=https://sandbox.duitku.com
DUITKU_API_VERSION=v2

LP_NEWLP_UNIT_PRICE=99000
LP_NEWLP_WEIGHT_GRAM=300
LP_NEWLP_LENGTH_CM=10
LP_NEWLP_WIDTH_CM=10
LP_NEWLP_HEIGHT_CM=10
LP_NEWLP_PRODUCT_NAME=Produk Baru
```

Jika beberapa LP memakai shipper berbeda, jangan pakai `SHIPPER_*` global.
Tambahkan field shipper per LP di `LP_CONFIGS` (mis. `shipperName`,
`shipperPhone`, `shipperAddress`, `shipperPostalCode`,
`shipperSubDistrictName`) dan baca dari situ.

### Langkah 3 — update client LP

```js
var CHECKOUT_CONFIG = {
  endpoint: 'https://<project>.supabase.co/functions/v1/lp-duitku-order',
  unitPrice: 99000,
  productName: 'Produk Baru',
  landingPageSource: 'newlp',
  freeShippingMax: 0
};

var EVERPRO_CONFIG = {
  base: 'https://<project>.supabase.co/functions/v1',
  ratesEndpoint: '.../lp-everpro-rates',
  createOrderEndpoint: '.../lp-everpro-create-order',
  originPostalCode: '...',
  weightPerItemGram: 300,
  lengthCm: 10,
  widthCm: 10,
  heightCm: 10,
  shipmentType: 'PICKUP'
};
```

`landingPageSource` harus sama dengan key di `LP_CONFIGS`.

### Langkah 4 — hitung amount di server

Jangan kirim `amount` dari client. Endpoint pembayaran harus:

1. baca `lp_slug`, `quantity`, `rate_code`, alamat;
2. ambil config server;
3. hitung rates Everpro;
4. hitung `amount`;
5. baru panggil Duitku.

### Langkah 5 — simpan snapshot order

Jalankan SQL di §7, lalu insert row sebelum redirect ke Duitku:

```text
order_number, lp_slug, status='pending', quantity, unit_price,
product_total, shipping_cost, shipping_discount, amount,
rate_code, receiver_*, duitku_reference
```

`lp-everpro-create-order` harus membaca row ini, bukan body request.

### Langkah 6 — deploy dan tes

1. Deploy `lp-everpro-rates`.
2. Deploy `lp-everpro-create-order`.
3. Deploy endpoint pembayaran (`lp-duitku-order` atau `duitku-lp-order` yang
   sudah dipatch).
4. Publish LP dengan cache-bust baru.
5. Tes rates, satu transaksi kecil, AWB, dan print label.
6. Cek log build marker di Supabase Functions.

---

## 7. Skema tabel `lp_orders` (disarankan)

Jalankan di Supabase SQL Editor:

```sql
create table if not exists public.lp_orders (
  id bigint generated by default as identity primary key,
  order_number text unique not null,
  lp_slug text not null,
  status text not null default 'pending',
  quantity integer not null,
  unit_price integer not null,
  product_total integer not null,
  shipping_cost integer not null,
  shipping_discount integer not null default 0,
  amount integer not null,
  rate_code text,
  logistic_code text,
  courier_name text,
  courier_service text,
  receiver_name text,
  receiver_phone text,
  receiver_address text,
  receiver_postal_code text,
  receiver_sub_district_name text,
  receiver_district_name text,
  receiver_city_name text,
  receiver_province_name text,
  duitku_reference text,
  everpro_order_no text,
  awb text,
  tracking_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lp_orders_lp_slug_idx on public.lp_orders (lp_slug);
create index if not exists lp_orders_status_idx on public.lp_orders (status);
create index if not exists lp_orders_duitku_reference_idx on public.lp_orders (duitku_reference);

alter table public.lp_orders enable row level security;

-- Tidak ada policy untuk anon/authenticated.
-- Hanya service role (Edge Function) yang boleh membaca/menulis.
```

Catatan: tabel ini bukan database produk. Ini hanya menyimpan snapshot
transaksi agar amount, alamat, dan status tidak bisa diubah dari browser.

---

## 8. Checklist deploy

- [ ] `LP_CONFIGS` sudah berisi LP baru.
- [ ] Harga/berat/dimensi di client dan server sama.
- [ ] Secrets Everpro + Duitku sudah di-set.
- [ ] `LandingPage_Config` tidak menimpa env dengan nilai sandbox (atau sudah
      diupdate ke production).
- [ ] `lp-everpro-rates` build marker benar.
- [ ] `lp-everpro-create-order` build marker benar.
- [ ] Endpoint pembayaran menghitung amount server-side.
- [ ] `lp_orders` sudah dibuat (jika dipakai).
- [ ] `js/main.js?v=...` sudah diganti.
- [ ] Hard refresh / purge cache.
- [ ] Tes rates untuk 2–3 kota.
- [ ] Tes transaksi kecil sampai AWB.
- [ ] Cek print label di dashboard Everpro.
- [ ] Cek callback URL Everpro.
- [ ] Cek log function untuk error.

---

## 9. Troubleshooting

| Gejala | Penyebab umum | Perbaikan |
|---|---|---|
| Berat di Everpro 175 Kg | Client kirim gram, Everpro expect kg | Bagi 1000 sebelum kirim |
| Ongkir Rp880.000 | Rate dianggap cents | Jangan bagi 100; Everpro Rupiah |
| `PickupTime is a required field` | `pickup_time` tidak dikirim | Kirim RFC3339 dari server |
| `expected=string, got=number` | `pickup_time` dikirim Unix timestamp | Pakai `toISOString()` |
| `Sign key tidak valid` | Nilai signed_key beda dengan get-rates | Samakan weight kg, shipment_price raw, package_price, dll. |
| `GAGAL MEMBUAT RESI` | Cargo/vehicle untuk paket kecil | Filter cargo/vehicle |
| `Nominal pembayaran tidak cocok` | Client amount beda dengan server | Hitung amount di server |
| `Pembayaran belum berhasil` | Belum bayar / `resultCode != 00` | Cek Duitku |
| `Kurir tidak tersedia` | Rate code sudah tidak ada | Ulangi checkout |
| Print label tidak muncul | AWB belum berhasil | Generate AWB / request pickup |

---

## 10. Build marker dan cache-bust

Setiap function punya `FUNCTION_BUILD`. Ganti saat deploy agar log membuktikan
versi yang berjalan.

- `lp-everpro-rates`: `2026-10-21-server-config`
- `lp-everpro-create-order`: `2026-10-21-hardened`
- Client: `index.html` → `js/main.js?v=20261021-5`

Saat mengubah kode, naikkan marker dan cache-bust. Jangan mengandalkan cache
browser.

File `LP-EVERPRO-*-LATEST.txt` adalah salinan untuk copy-paste ke dashboard
Supabase. Sumber kebenaran tetap `supabase/functions/*/index.ts`; regenerate
file `.txt` setiap kali function berubah.

---

## 11. Hardening berikutnya (urutan prioritas)

1. **Server-side amount untuk Duitku.** Ini yang paling penting. Patch
   `duitku-lp-order` atau buat `lp-duitku-order` yang memakai `LP_CONFIGS`.
2. **Snapshot order di `lp_orders`.** Bind amount + alamat + rate_code ke order
   number.
3. ~~**`lp-everpro-rates` server-side config.**~~ Selesai di repo: build
   `2026-10-21-server-config` memakai `lp_slug` + `quantity` + `LP_CONFIGS`.
   Pastikan sudah ter-deploy.
4. ~~**Filter array `flattenRates`.**~~ Selesai di repo: build
   `2026-10-21-hardened` memfilter array response juga, bukan hanya object
   bergrup.
5. **Rate limiting** untuk endpoint publik.
6. **Callback key** yang kuat dan update `lp_orders` dari callback.
7. **Test otomatis** untuk kasus amount mismatch, unpaid, cargo, dan replay.

---

## 12. Untuk agent/AI di sesi berikutnya

Saat diminta mengerjakan LP baru atau mengubah checkout:

1. Baca dokumen ini sampai §6.
2. Baca `supabase/functions/lp-everpro-create-order/index.ts` dan
   `supabase/functions/lp-everpro-rates/index.ts`.
3. Jangan pernah menambahkan harga/berat/dimensi yang dipercaya dari client.
4. Tambah LP baru sebagai entry `LP_CONFIGS`, bukan `if (lpSlug === ...)`
   yang tersebar.
5. Setelah mengubah `js/main.js`, naikkan `?v=` di `index.html`.
6. Setelah mengubah function, naikkan `FUNCTION_BUILD`.
7. Update dokumen ini jika ada kontrak atau keputusan baru.

---

## 13. Riwayat keputusan

- Berat dikirim ke Everpro dalam **kg**; client mengirim gram.
- Harga Everpro adalah **Rupiah**, bukan cents.
- `signed_key` memakai nilai raw dari get-rates.
- `pickup_time` dipilih server, format RFC3339, skip Minggu.
- `shipment_type = PICKUP` untuk TinyHoney.
- `freeShippingMax = 0` (promo teks tetap tampil).
- `cargo` dan `vehicle` tidak ditampilkan untuk TinyHoney.
- `client_order_no = order_number` Duitku untuk idempotensi.
- Callback Everpro tidak diperlukan untuk print label; admin generate AWB dari
  dashboard.
