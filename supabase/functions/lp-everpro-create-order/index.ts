import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import md5 from "https://esm.sh/blueimp-md5@2.19.0";

// Visible marker so the deployed logs prove which build is running.
const FUNCTION_BUILD = "2026-10-21-promo-env";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name, *",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function envInt(name: string, fallback: number): number {
  const parsed = parseInt(Deno.env.get(name) || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Env yang dipakai untuk promo harus > 0. Kalau secret lama bernilai 0
// (mis. FREE_SHIPPING_MAX dari fitur lama), jangan sampai promo mati.
function envPositiveInt(name: string, fallback: number): number {
  const parsed = parseInt(Deno.env.get(name) || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const LP_CONFIGS: Record<string, {
  unitPrice: number;
  freeShippingMax: number;
  freeShippingMinQuantity: number;
  weightPerItemGram: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  productName: string;
  packageTypeId: number;
  shipmentType: string;
}> = {
  tinyhoney: {
    unitPrice: envInt("LP_TINYHONEY_UNIT_PRICE", 99000),
    // Promo ongkir: 100% discount, capped at Rp10.000, minimum 2 bottles.
    // Pakai nama env yang sudah ada di Supabase, jangan bikin nama baru.
    freeShippingMax: envPositiveInt("LP_TINYHONEY_FREE_SHIPPING_MAX", 10000),
    freeShippingMinQuantity: envPositiveInt("LP_TINYHONEY_SHIPPING_PROMO_MIN_QTY", 2),
    weightPerItemGram: envInt("LP_TINYHONEY_WEIGHT_GRAM", 175),
    lengthCm: envInt("LP_TINYHONEY_LENGTH_CM", 6),
    widthCm: envInt("LP_TINYHONEY_WIDTH_CM", 6),
    heightCm: envInt("LP_TINYHONEY_HEIGHT_CM", 11),
    productName: Deno.env.get("LP_TINYHONEY_PRODUCT_NAME") || "TinyHoney",
    packageTypeId: 1,
    // Courier pickup at the TinyHoney warehouse.
    shipmentType: "PICKUP",
  },
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getLpConfig(lpSlug: string) {
  const config = LP_CONFIGS[lpSlug];
  if (!config) {
    throw new HttpError(400, `LP "${lpSlug}" belum dikonfigurasi di lp-everpro-create-order.`);
  }
  return config;
}

function formatPhone62(phone: string): string {
  let value = String(phone || "").replace(/[^0-9]/g, "");
  if (value.startsWith("0")) value = "62" + value.slice(1);
  if (!value.startsWith("62") && value.length > 0) value = "62" + value;
  return value;
}

/**
 * Buyers never choose a pickup slot. If Everpro returns no slot we default to
 * the next day at 10:00 Asia/Jakarta (03:00 UTC), skipping Sunday. The admin
 * can still adjust the pickup schedule from the Everpro dashboard.
 */
function defaultPickupTime(): string {
  const now = new Date();
  const jakartaNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  let candidate = new Date(Date.UTC(
    jakartaNow.getUTCFullYear(),
    jakartaNow.getUTCMonth(),
    jakartaNow.getUTCDate() + 1,
    3,
    0,
    0,
    0,
  ));

  // Sunday is not a normal courier pickup day.
  while (candidate.getUTCDay() === 0) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }

  return candidate.toISOString();
}

/**
 * Picks the earliest available pickup slot for the selected rate. If Everpro
 * does not return any slot, fall back to defaultPickupTime().
 */
async function resolvePickupTime(
  apiUrl: string,
  token: string,
  rateCode: string,
): Promise<string> {
  try {
    const url = `${apiUrl}/shipment/v1/pickup-times?rate_codes=${
      encodeURIComponent(rateCode)
    }&timezone=Asia/Jakarta`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.warn(
        "[LP-EVERPRO-CREATE-ORDER] pickup-times HTTP",
        response.status,
      );
      return defaultPickupTime();
    }

    const json = await response.json();
    const groups = Array.isArray(json?.data?.available_pickup_time)
      ? json.data.available_pickup_time
      : [];
    const target = String(rateCode || "").toUpperCase();
    const group = groups.find((item: any) =>
      String(item?.rate_code || "").toUpperCase() === target
    ) || groups[0];
    const days = Array.isArray(group?.pickup_time_list)
      ? group.pickup_time_list
      : [];

    const now = Date.now();
    let earliest: number | null = null;
    for (const day of days) {
      const slots = Array.isArray(day?.pickup_times) ? day.pickup_times : [];
      for (const slot of slots) {
        const startMs = new Date(slot?.start_at).getTime();
        if (!Number.isFinite(startMs) || startMs <= now) continue;
        const timestamp = Math.floor(startMs / 1000);
        if (earliest === null || timestamp < earliest) earliest = timestamp;
      }
    }

    if (earliest !== null) {
      const pickupTime = new Date(earliest * 1000).toISOString();
      console.log(
        "[LP-EVERPRO-CREATE-ORDER] Using available pickup time:",
        pickupTime,
      );
      return pickupTime;
    }
  } catch (error) {
    console.warn(
      "[LP-EVERPRO-CREATE-ORDER] pickup-times lookup failed:",
      (error as Error).message,
    );
  }

  return defaultPickupTime();
}

function normalizeRatePrice(price: unknown): number {
  const value = Number(price);
  if (!Number.isFinite(value) || value < 0) return 0;
  // Everpro returns rate prices in Rupiah, not cents.
  return Math.round(value);
}

// TinyHoney is a small parcel. Cargo/vehicle services often reject AWB
// generation for this weight, so the server refuses to select them too.
const ALLOWED_RATE_GROUPS = ["regular", "express", "same_day", "instant"];

function isAllowedRate(rate: any): boolean {
  const group = String(rate?.group || rate?.rate_group || "").trim().toLowerCase();
  if (group) return ALLOWED_RATE_GROUPS.includes(group);
  // Flat Everpro arrays have no group. Reject obvious cargo/vehicle names so
  // an array response cannot bypass the group filter.
  const logistic = String(rate?.logistic_name || "").trim().toLowerCase();
  return !logistic.includes("cargo") && !logistic.includes("vehicle");
}

function flattenRates(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(isAllowedRate);
  if (Array.isArray(data.rates)) return data.rates.filter(isAllowedRate);

  const rows: any[] = [];
  for (const group of ALLOWED_RATE_GROUPS) {
    if (Array.isArray(data[group])) rows.push(...data[group]);
  }
  return rows;
}

function selectRate(
  rates: any[],
  rateCode: string,
  courierName: string,
  courierService: string,
): any {
  const code = String(rateCode || "").trim().toLowerCase();
  const courier = String(courierName || "").trim().toLowerCase();
  const service = String(courierService || "").trim().toLowerCase();
  if (!code) {
    throw new HttpError(400, "rate_code wajib diisi.");
  }

  let matches = rates.filter((rate) => String(rate?.rate_code || "").trim().toLowerCase() === code);
  if (courier) {
    const byCourier = matches.filter(
      (rate) => String(rate?.logistic_name || "").trim().toLowerCase() === courier,
    );
    if (byCourier.length > 0) matches = byCourier;
  }
  if (service) {
    const byService = matches.filter(
      (rate) => String(rate?.rate_name || "").trim().toLowerCase() === service,
    );
    if (byService.length > 0) matches = byService;
  }

  if (matches.length === 0) {
    throw new HttpError(
      409,
      "Kurir yang dipilih tidak tersedia lagi untuk alamat ini. Silakan ulangi checkout.",
    );
  }

  matches.sort((a, b) => Number(a?.price || 0) - Number(b?.price || 0));
  return matches[0];
}

type DuitkuMode = "v1" | "v2";

function duitkuStatusUrl(baseUrl: string, mode: DuitkuMode): string {
  const base = String(baseUrl || "").replace(/\/$/, "");
  if (mode === "v2") {
    if (base.endsWith("/webapi/api")) return `${base}/merchant/transactionStatus`;
    if (base.endsWith("/webapi")) return `${base}/api/merchant/transactionStatus`;
    return `${base}/webapi/api/merchant/transactionStatus`;
  }
  if (base.endsWith("/api")) return `${base}/merchant/transactionStatus`;
  return `${base}/api/merchant/transactionStatus`;
}

async function hmacSha256Hex(message: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getDuitkuConfig() {
  const merchantCode =
    Deno.env.get("DUITKU_MERCHANT_CODE") ||
    Deno.env.get("DUITKU_LP_MERCHANT_CODE") ||
    Deno.env.get("DUITKU_MERCHANT") ||
    "";
  const apiKey =
    Deno.env.get("DUITKU_API_KEY") ||
    Deno.env.get("DUITKU_LP_API_KEY") ||
    Deno.env.get("DUITKU_KEY") ||
    "";

  let baseUrl =
    Deno.env.get("DUITKU_API_URL") ||
    Deno.env.get("DUITKU_BASE_URL") ||
    "";

  const modeEnv = (
    Deno.env.get("DUITKU_API_VERSION") ||
    Deno.env.get("DUITKU_API_MODE") ||
    ""
  ).toLowerCase();
  const isProduction =
    (Deno.env.get("DUITKU_ENV") || Deno.env.get("DUITKU_MODE") || "")
      .toLowerCase() === "production" ||
    (Deno.env.get("DUITKU_ENV") || Deno.env.get("DUITKU_MODE") || "")
      .toLowerCase() === "prod" ||
    Deno.env.get("DUITKU_IS_PRODUCTION") === "true" ||
    Deno.env.get("DUITKU_PRODUCTION") === "true";

  if (!baseUrl) {
    // The existing duitku-lp-order function uses Duitku v2 (sandbox/passport).
    // Default to v2 so this verification matches it out of the box.
    baseUrl = isProduction
      ? "https://passport.duitku.com"
      : "https://sandbox.duitku.com";
  }

  let mode: DuitkuMode;
  if (modeEnv === "v1" || modeEnv === "v2") {
    mode = modeEnv as DuitkuMode;
  } else {
    const lower = baseUrl.toLowerCase();
    if (lower.includes("api-sandbox.duitku.com") || lower.includes("api-prod.duitku.com")) {
      mode = "v1";
    } else if (
      lower.includes("sandbox.duitku.com") ||
      lower.includes("passport.duitku.com") ||
      lower.includes("/webapi")
    ) {
      mode = "v2";
    } else {
      mode = "v2";
    }
  }

  return { merchantCode, apiKey, baseUrl, mode };
}

async function getDuitkuStatus(orderNumber: string) {
  const { merchantCode, apiKey, baseUrl, mode } = getDuitkuConfig();
  if (!merchantCode || !apiKey) {
    throw new HttpError(
      500,
      "Duitku credentials belum dikonfigurasi. Set DUITKU_MERCHANT_CODE dan DUITKU_API_KEY.",
    );
  }

  // Duitku v2: HMAC-SHA256(merchantCode + merchantOrderId, apiKey).
  // Duitku v1 (legacy): MD5(merchantCode + merchantOrderId + apiKey).
  const signature = mode === "v2"
    ? await hmacSha256Hex(merchantCode + orderNumber, apiKey)
    : md5(merchantCode + orderNumber + apiKey);

  const response = await fetch(duitkuStatusUrl(baseUrl, mode), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      merchantCode,
      merchantOrderId: orderNumber,
      signature,
    }),
  });

  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new HttpError(502, `Duitku mengembalikan respons tidak valid: ${text}`);
  }

  if (!response.ok) {
    throw new HttpError(502, `Gagal cek status Duitku: ${text}`);
  }

  const payload = json?.data ?? json;
  return {
    // v1 uses resultCode, v2 uses statusCode. Accept both.
    resultCode: String(
      payload?.resultCode ??
        payload?.statusCode ??
        json?.resultCode ??
        json?.statusCode ??
        "",
    ),
    amount: Number(payload?.amount ?? json?.amount ?? 0),
    reference: String(payload?.reference ?? json?.reference ?? ""),
    merchantOrderId: String(
      payload?.merchantOrderId ?? json?.merchantOrderId ?? "",
    ),
    mode,
    raw: json,
  };
}

async function resolveEverproConfig(supabase: any, lpSlug: string) {
  let key = Deno.env.get("EVERPRO_LP_CLIENT_KEY");
  let secret = Deno.env.get("EVERPRO_LP_CLIENT_SECRET");
  let apiUrl = Deno.env.get("EVERPRO_LP_API_URL");

  try {
    const { data: lpConf } = await supabase
      .from("LandingPage_Config")
      .select("*")
      .eq("lp_slug", lpSlug)
      .maybeSingle();

    if (lpConf) {
      if (lpConf.everpro_client_key) key = lpConf.everpro_client_key;
      if (lpConf.everpro_client_secret) secret = lpConf.everpro_client_secret;
      if (lpConf.everpro_api_url) apiUrl = lpConf.everpro_api_url;
    }
  } catch (error) {
    console.warn(
      "[LP-EVERPRO-CREATE-ORDER] LandingPage_Config warning:",
      (error as Error).message,
    );
  }

  if (!key || !secret || !apiUrl) {
    throw new HttpError(
      500,
      `Everpro credentials/API URL untuk LP (${lpSlug}) belum dikonfigurasi. ` +
        "Set EVERPRO_LP_CLIENT_KEY, EVERPRO_LP_CLIENT_SECRET, dan EVERPRO_LP_API_URL.",
    );
  }

  return { key, secret, apiUrl: String(apiUrl).replace(/\/$/, "") };
}

async function getEverproToken(apiUrl: string, key: string, secret: string) {
  const response = await fetch(`${apiUrl}/auth/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_key: key, client_secret: secret }),
  });

  const json = await response.json();
  const token = json?.data?.token || json?.token;
  if (!response.ok || !token) {
    throw new HttpError(502, `Everpro authentication gagal: ${JSON.stringify(json)}`);
  }
  return String(token);
}

async function fetchEverproRates(apiUrl: string, token: string, payload: Record<string, unknown>) {
  const response = await fetch(`${apiUrl}/shipment/v2/rates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new HttpError(502, `Everpro rates mengembalikan respons tidak valid: ${text}`);
  }

  if (!response.ok) {
    throw new HttpError(502, `Everpro rates gagal: ${text}`);
  }
  return json;
}

async function getEverproOrder(apiUrl: string, token: string, clientOrderNo: string) {
  const response = await fetch(
    `${apiUrl}/shipment/v1/orders/${encodeURIComponent(clientOrderNo)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (response.status === 404 || response.status === 405) return null;

  const text = await response.text();
  if (!response.ok) {
    console.warn(
      `[LP-EVERPRO-CREATE-ORDER] Get order returned ${response.status}:`,
      text,
    );
    return null;
  }

  try {
    const json = JSON.parse(text);
    if (json?.success === false) return null;
    return json;
  } catch {
    return null;
  }
}

function extractOrderData(json: any) {
  const payload = json?.data ?? json ?? {};
  const nested = payload?.order ?? payload?.shipment ?? {};
  return {
    awb:
      payload?.awb ||
      payload?.awb_number ||
      payload?.airway_bill ||
      nested?.awb ||
      nested?.awb_number ||
      "",
    orderNo:
      payload?.order_no ||
      payload?.shipment_order_no ||
      payload?.client_order_no ||
      nested?.order_no ||
      nested?.shipment_order_no ||
      nested?.client_order_no ||
      "",
    trackingUrl: payload?.tracking_url || payload?.trackingUrl || nested?.tracking_url || "",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log(`[LP-EVERPRO-CREATE-ORDER] build ${FUNCTION_BUILD}`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_ANON_KEY") ||
      "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    console.log("[LP-EVERPRO-CREATE-ORDER] Received request:", JSON.stringify(body));

    const orderNumber = String(body?.order_number || body?.client_order_no || "").trim();
    const lpSlug = String(body?.lp_slug || "tinyhoney").toLowerCase();
    const config = getLpConfig(lpSlug);
    const quantity = parseInt(String(body?.quantity ?? "1"), 10);

    if (!orderNumber) {
      throw new HttpError(400, "order_number wajib diisi.");
    }
    if (!/^[A-Za-z0-9._-]+$/.test(orderNumber)) {
      throw new HttpError(400, "order_number tidak valid.");
    }
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
      throw new HttpError(400, "Jumlah produk tidak valid.");
    }

    const receiver = {
      name: String(body?.receiver_name || body?.customer_name || "").trim(),
      phone: String(body?.receiver_phone || body?.phone || "").trim(),
      address: String(body?.receiver_address || body?.address || "").trim(),
      postalCode: String(body?.receiver_postal_code || body?.postal_code || "").trim(),
      subDistrictName: String(
        body?.receiver_sub_district_name || body?.sub_district_name || "",
      ).trim(),
    };

    if (receiver.name.length < 3) {
      throw new HttpError(400, "Nama penerima minimal 3 karakter.");
    }
    if (receiver.phone.replace(/[^0-9]/g, "").length < 10) {
      throw new HttpError(400, "Nomor HP penerima tidak valid.");
    }
    if (receiver.address.length < 5) {
      throw new HttpError(400, "Alamat penerima tidak valid.");
    }
    if (!receiver.postalCode) {
      throw new HttpError(400, "Kode pos penerima wajib diisi.");
    }

    const rateCode = String(body?.rate_code || "").trim();
    const courierName = String(body?.courier_name || "").trim();
    const courierService = String(body?.courier_service || "").trim();
    if (!rateCode) {
      throw new HttpError(400, "rate_code wajib diisi.");
    }

    const shipper = {
      name: Deno.env.get("SHIPPER_NAME") || String(body?.shipper_name || "TinyHoney").trim(),
      phone:
        Deno.env.get("SHIPPER_PHONE") ||
        String(body?.shipper_phone || "6289503263580").trim(),
      address:
        Deno.env.get("SHIPPER_ADDRESS") ||
        String(
          body?.shipper_address ||
            "Jl. Saturnus Tengah I No. 1, Manjahlega, Rancasari, Kota Bandung, Jawa Barat 40286",
        ).trim(),
      postalCode:
        Deno.env.get("SHIPPER_POSTAL_CODE") ||
        String(body?.shipper_postal_code || "40286").trim(),
      subDistrictName:
        Deno.env.get("SHIPPER_SUB_DISTRICT_NAME") ||
        String(body?.shipper_sub_district_name || "Manjahlega").trim(),
    };

    if (!shipper.name || !shipper.phone || !shipper.address || !shipper.postalCode) {
      throw new HttpError(
        500,
        "Data shipper belum lengkap. Set SHIPPER_NAME, SHIPPER_PHONE, SHIPPER_ADDRESS, dan SHIPPER_POSTAL_CODE.",
      );
    }

    // 1. Verify the payment with Duitku before doing anything else.
    const payment = await getDuitkuStatus(orderNumber);
    if (payment.resultCode !== "00") {
      throw new HttpError(
        402,
        `Pembayaran belum berhasil (resultCode=${payment.resultCode || "-"}).`,
      );
    }
    if (payment.merchantOrderId && payment.merchantOrderId !== orderNumber) {
      throw new HttpError(402, "Nomor order Duitku tidak cocok.");
    }

    const clientReference = String(body?.reference || "").trim();
    if (!clientReference) {
      throw new HttpError(400, "reference pembayaran wajib diisi.");
    }
    if (!payment.reference) {
      throw new HttpError(502, "Duitku tidak mengembalikan reference pembayaran.");
    }
    if (clientReference !== payment.reference) {
      throw new HttpError(402, "Referensi pembayaran tidak cocok.");
    }

    // 2. Authenticate to Everpro.
    const everproConfig = await resolveEverproConfig(supabase, lpSlug);
    const apiUrl = everproConfig.apiUrl;
    const token = await getEverproToken(apiUrl, everproConfig.key, everproConfig.secret);

    // 3. Idempotency: return the existing shipment if this order was already created.
    const existing = await getEverproOrder(apiUrl, token, orderNumber);
    if (existing) {
      const data = extractOrderData(existing);
      return jsonResponse({
        success: true,
        already_exists: true,
        order_number: orderNumber,
        everpro_order_no: data.orderNo || orderNumber,
        awb: data.awb,
        tracking_url: data.trackingUrl,
        everpro_response: existing,
      });
    }

    // 4. Recalculate product + shipping on the server. Never trust client prices.
    const productTotal = quantity * config.unitPrice;
    const weightGram = quantity * config.weightPerItemGram;

    const rateRequest: Record<string, unknown> = {
      origin_postal_code: shipper.postalCode,
      origin_sub_district_name: shipper.subDistrictName,
      destination_postal_code: receiver.postalCode,
      destination_sub_district_name: receiver.subDistrictName,
      // Everpro rates expect kilograms.
      weight: weightGram / 1000,
      item_price: productTotal,
      is_cod: false,
      is_use_insurance: false,
      package_type_id: config.packageTypeId,
      shipment_type: config.shipmentType,
      width: config.widthCm,
      height: config.heightCm,
      length: config.lengthCm,
    };

    const ratesJson = await fetchEverproRates(apiUrl, token, rateRequest);
    let selectedRate = selectRate(
      flattenRates(ratesJson?.data),
      rateCode,
      courierName,
      courierService,
    );
    let shippingCost = normalizeRatePrice(selectedRate?.price);
    if (!Number.isFinite(shippingCost) || shippingCost <= 0) {
      throw new HttpError(
        502,
        "Everpro tidak mengembalikan harga ongkir yang valid untuk kurir ini.",
      );
    }

    // Promo ongkir: the buyer sees a shipping discount, but Everpro must keep
    // shipment_price equal to the rate it quoted. Apply the discount to the
    // product value instead (package_price), then re-fetch rates with that
    // package_price so the signed_key matches the create-order payload.
    const shippingDiscount = quantity >= config.freeShippingMinQuantity
      ? Math.min(shippingCost, config.freeShippingMax, productTotal)
      : 0;
    const packagePrice = productTotal - shippingDiscount;

    if (shippingDiscount > 0) {
      const promoRatesJson = await fetchEverproRates(apiUrl, token, {
        ...rateRequest,
        item_price: packagePrice,
      });
      const promoRate = selectRate(
        flattenRates(promoRatesJson?.data),
        rateCode,
        courierName,
        courierService,
      );
      const promoShippingCost = normalizeRatePrice(promoRate?.price);
      if (promoShippingCost !== shippingCost) {
        throw new HttpError(
          409,
          "Ongkir berubah saat promo diterapkan. Silakan ulangi checkout.",
        );
      }
      selectedRate = promoRate;
      shippingCost = promoShippingCost;
    }

    // Everpro signs the raw rate values. Keep the raw price for the
    // create-order payload, and use the normalized Rupiah value for Duitku.
    const shippingPriceRaw = Math.round(Number(selectedRate?.price) || 0);
    const shippingPaid = shippingCost - shippingDiscount;
    const expectedTotal = packagePrice + shippingCost;

    if (!Number.isFinite(payment.amount) || payment.amount !== expectedTotal) {
      throw new HttpError(
        402,
        `Nominal pembayaran tidak cocok. Dibayar Rp${payment.amount}, seharusnya Rp${expectedTotal}.`,
      );
    }

    if (!selectedRate?.signed_key) {
      throw new HttpError(
        502,
        "Everpro tidak mengembalikan signed_key untuk kurir ini. Coba pilih kurir lain.",
      );
    }

    // 5. Pick a pickup slot server-side (the buyer never chooses one).
    const pickupTime = await resolvePickupTime(
      apiUrl,
      token,
      String(selectedRate?.rate_code || rateCode),
    );

    // 6. Create the Everpro shipment order.
    const orderPayload: Record<string, unknown> = {
      // These values must match the get-rates request/response exactly:
      // weight in kilograms and the raw Rupiah price. Everpro validates
      // signed_key against them.
      cashback: Number(selectedRate?.cashback) || 0,
      client_order_no: orderNumber,
      cod_price: 0,
      height: config.heightCm,
      insurance_price: Number(selectedRate?.insurance_price) || 0,
      is_cod: false,
      is_flat_rate: Boolean(selectedRate?.is_flat_rate),
      is_use_insurance: false,
      is_use_woodpacking: false,
      length: config.lengthCm,
      max_duration: Number(selectedRate?.max_duration) || 3,
      min_duration: Number(selectedRate?.min_duration) || 1,
      package_desc: `${config.productName} x${quantity}`,
      // The promo discount is applied here, not to shipment_price. This keeps
      // Everpro's shipping price identical to the rate returned by the courier.
      package_price: packagePrice,
      package_type_id: config.packageTypeId,
      // Required by Everpro. The buyer never chooses this; the server uses the
      // earliest available slot (or a safe default) and the admin can
      // reschedule from the Everpro dashboard. Everpro expects RFC3339 here.
      pickup_time: pickupTime,
      rate_code: String(selectedRate?.rate_code || rateCode),
      receiver_address: receiver.address,
      receiver_name: receiver.name,
      receiver_phone: formatPhone62(receiver.phone),
      receiver_postal_code: receiver.postalCode,
      receiver_sub_district_name: receiver.subDistrictName,
      shipment_price: shippingPriceRaw,
      shipment_type: config.shipmentType,
      shipper_address: shipper.address,
      shipper_name: shipper.name,
      shipper_phone: formatPhone62(shipper.phone),
      shipper_postal_code: shipper.postalCode,
      shipper_sub_district_name: shipper.subDistrictName,
      signed_key: String(selectedRate.signed_key),
      surcharge: Number(selectedRate?.surcharge) || 0,
      weight: weightGram / 1000,
      width: config.widthCm,
    };

    const rateId = Number(selectedRate?.rate_id || selectedRate?.rateID || 0);
    if (Number.isFinite(rateId) && rateId > 0) {
      orderPayload.rateID = rateId;
    }

    if (body?.reference) {
      const cleanReference = String(body.reference)
        .replace(/[^0-9a-zA-Z\-,./()']/g, "")
        .slice(0, 255);
      if (cleanReference) {
        orderPayload.order_reference_id = cleanReference;
      }
    }

    console.log(
      "[LP-EVERPRO-CREATE-ORDER] Creating Everpro order:",
      JSON.stringify(orderPayload),
    );

    const createResponse = await fetch(`${apiUrl}/shipment/v2/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    const createText = await createResponse.text();
    let createJson: any;
    try {
      createJson = JSON.parse(createText);
    } catch {
      createJson = { raw: createText };
    }

    if (!createResponse.ok || createJson?.success === false) {
      // A duplicate client_order_no means a previous request already created it.
      const existingAfterError = await getEverproOrder(apiUrl, token, orderNumber);
      if (existingAfterError) {
        const data = extractOrderData(existingAfterError);
        return jsonResponse({
          success: true,
          already_exists: true,
          order_number: orderNumber,
          everpro_order_no: data.orderNo || orderNumber,
          awb: data.awb,
          tracking_url: data.trackingUrl,
          everpro_response: existingAfterError,
        });
      }

      throw new HttpError(
        502,
        `Everpro create order gagal: ${JSON.stringify(createJson)}`,
      );
    }

    const data = extractOrderData(createJson);
    return jsonResponse({
      success: true,
      order_number: orderNumber,
      everpro_order_no: data.orderNo || orderNumber,
      awb: data.awb,
      tracking_url: data.trackingUrl,
      payment: {
        amount: payment.amount,
        reference: payment.reference,
      },
      pricing: {
        product_total: productTotal,
        // The promo is deducted from the product value, not from Everpro's
        // shipment_price.
        product_discount: shippingDiscount,
        package_price: packagePrice,
        shipping_cost: shippingCost,
        shipping_paid: shippingPaid,
        total: expectedTotal,
      },
      shipping: {
        courier_name: selectedRate?.logistic_name || courierName,
        courier_service: selectedRate?.rate_name || "",
        rate_code: selectedRate?.rate_code || rateCode,
        cost: shippingCost,
        discount: shippingDiscount,
        paid: shippingPaid,
        package_price: packagePrice,
      },
      everpro_response: createJson,
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    console.error("[LP-EVERPRO-CREATE-ORDER] Error:", message);
    return jsonResponse({ success: false, error: message }, status);
  }
});
