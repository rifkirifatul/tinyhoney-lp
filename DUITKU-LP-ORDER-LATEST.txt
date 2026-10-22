import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Visible marker so deployed logs prove which build is running.
const FUNCTION_BUILD = "2026-10-22-duitku-timeout-method";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-application-name, *",
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

// Env promo harus > 0. Kalau secret lama bernilai 0, pakai default agar
// promo ongkir tidak mati tanpa sengaja.
function envPositiveInt(name: string, fallback: number): number {
  const parsed = parseInt(Deno.env.get(name) || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Server-side product and promo configuration.
 *
 * The browser never supplies the price, the promo cap, or the minimum
 * quantity. Keep these defaults in sync with lp-everpro-rates and
 * lp-everpro-create-order.
 */
const LP_CONFIGS: Record<string, {
  unitPrice: number;
  freeShippingMax: number;
  freeShippingMinQuantity: number;
  productName: string;
}> = {
  tinyhoney: {
    unitPrice: envInt("LP_TINYHONEY_UNIT_PRICE", 99000),
    // Pakai nama env yang sudah ada di Supabase.
    freeShippingMax: envPositiveInt("LP_TINYHONEY_FREE_SHIPPING_MAX", 10000),
    freeShippingMinQuantity: envPositiveInt("LP_TINYHONEY_SHIPPING_PROMO_MIN_QTY", 2),
    productName: Deno.env.get("LP_TINYHONEY_PRODUCT_NAME") || "TinyHoney",
  },
};

function getLpConfig(lpSlug: string) {
  const config = LP_CONFIGS[lpSlug];
  if (!config) {
    throw new HttpError(
      400,
      `LP "${lpSlug}" belum dikonfigurasi di duitku-lp-order.`,
    );
  }
  return config;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeRatePrice(price: unknown): number {
  const value = Number(price);
  if (!Number.isFinite(value) || value < 0) return 0;
  // Everpro returns rate prices in Rupiah, not cents.
  return Math.round(value);
}

// TinyHoney is a small parcel. Cargo/vehicle services are blocked here too,
// even if the rates response shape changes.
const ALLOWED_RATE_GROUPS = ["regular", "express", "same_day", "instant"];

function isAllowedRate(rate: any): boolean {
  const group = String(rate?.group || rate?.rate_group || "").trim().toLowerCase();
  if (group) return ALLOWED_RATE_GROUPS.includes(group);
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

  let matches = rates.filter(
    (rate) => String(rate?.rate_code || "").trim().toLowerCase() === code,
  );
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

async function hmacSha256Hex(message: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getDuitkuConfig() {
  // Pakai nama env Duitku yang sudah ada. Tidak perlu env baru.
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
  const apiUrl = (
    Deno.env.get("DUITKU_API_URL") ||
    Deno.env.get("DUITKU_BASE_URL") ||
    ""
  ).trim();
  const envValue = (
    Deno.env.get("DUITKU_ENV") ||
    Deno.env.get("DUITKU_MODE") ||
    ""
  ).toLowerCase();

  // Ikuti environment yang sama dengan lp-everpro-create-order. Kalau
  // DUITKU_API_URL berisi passport/production, berarti production.
  const isProduction = envValue === "production" ||
    envValue === "prod" ||
    /passport|production|prod/i.test(apiUrl);

  // Duitku v2 inquiry host. Kalau API URL lama memakai api-sandbox/api-prod,
  // arahkan ke host v2 yang sesuai agar path inquiry tidak salah.
  let baseUrl = apiUrl;
  if (baseUrl.includes("api-sandbox")) {
    baseUrl = "https://sandbox.duitku.com";
  } else if (baseUrl.includes("api-prod")) {
    baseUrl = "https://passport.duitku.com";
  }
  if (!baseUrl) {
    baseUrl = isProduction
      ? "https://passport.duitku.com"
      : "https://sandbox.duitku.com";
  }

  return {
    merchantCode,
    apiKey,
    isProduction,
    inquiryUrl: duitkuInquiryUrl(baseUrl),
  };
}

function duitkuInquiryUrl(baseUrl: string): string {
  const raw = String(baseUrl || "").trim();
  if (!raw) return "";

  // Selalu pakai host + path v2 yang canonical. Ini mencegah URL dobel
  // kalau DUITKU_API_URL ternyata berisi full path (mis. transactionStatus
  // atau /v1/inquiry), yang bisa membuat Duitku membalas 404/504.
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    let host = url.host.toLowerCase();
    if (hostname === "api-sandbox.duitku.com" || hostname === "sandbox.duitku.com") {
      host = "sandbox.duitku.com";
    } else if (
      hostname === "api-prod.duitku.com" || hostname === "passport.duitku.com"
    ) {
      host = "passport.duitku.com";
    }
    return `${url.protocol}//${host}/webapi/api/merchant/v2/inquiry`;
  } catch {
    return `${raw.replace(/\/+$/, "")}/webapi/api/merchant/v2/inquiry`;
  }
}

async function fetchDuitkuInquiry(
  url: string,
  payload: unknown,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Only allow the return URL to point at the LP origin that called us. This
 * avoids turning the payment endpoint into an open redirect.
 */
function resolveReturnUrl(req: Request, body: any): string {
  const origin = req.headers.get("origin") || "";
  const fallback = origin ? `${origin}/` : "https://tinyhoney.id/";
  const raw = String(body?.return_url || body?.returnUrl || "").trim();

  if (!raw || !/^https?:\/\//i.test(raw)) return fallback;

  try {
    const parsed = new URL(raw);
    if (origin) {
      const allowed = new URL(origin);
      if (parsed.origin !== allowed.origin) return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function mapPaymentMethod(value: unknown): string {
  const code = String(value || "").trim().toUpperCase();
  // The LP labels these as Alfamart/Indomaret. Duitku v2 uses FT/IR.
  if (code === "AL") return "FT";
  if (code === "ID") return "IR";
  return code;
}

const ALLOWED_PAYMENT_METHODS = new Set([
  "BC", "M2", "SP", "I1", "BT", "FT", "IR",
  "VA", "B1", "A1", "AG", "NC", "BR", "S1", "DM",
  "BV", "OV", "SA", "LF", "LA", "DA", "SL", "OL",
  "NQ", "SQ", "DN", "AT", "JP",
]);

function readString(value: unknown, max = 255): string {
  return String(value ?? "").trim().slice(0, max);
}

async function readCallbackPayload(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await req.json();
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(json || {})) {
      result[key] = String(value ?? "");
    }
    return result;
  }

  const form = await req.formData();
  const result: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    result[key] = String(value ?? "");
  }
  return result;
}

/**
 * Duitku callback. URL default:
 *   /functions/v1/duitku-lp-order?action=callback
 * Signature: HMAC-SHA256(merchantCode + amount + merchantOrderId, apiKey).
 * Callback hanya memperbarui snapshot; gatekeeper tetap
 * lp-everpro-create-order.
 */
async function handleDuitkuCallback(req: Request): Promise<Response> {
  console.log(`[DUITKU-LP-ORDER] callback build ${FUNCTION_BUILD}`);

  // Duitku sends the real callback as POST form-urlencoded. A GET/HEAD is
  // only a reachability probe; answer 200 so the URL is considered healthy.
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  try {
    const data = await readCallbackPayload(req);
    console.log("[DUITKU-LP-ORDER] callback payload:", JSON.stringify(data));

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

    if (!merchantCode || !apiKey) {
      console.error("[DUITKU-LP-ORDER] Duitku credentials are missing.");
      return new Response("CONFIG ERROR", { status: 500 });
    }

    const amount = String(data.amount || "");
    const merchantOrderId = String(data.merchantOrderId || "");
    const signature = String(data.signature || "");
    const resultCode = String(data.resultCode || "");
    const reference = String(data.reference || "");

    if (
      String(data.merchantCode || "") !== merchantCode ||
      !merchantOrderId ||
      !amount ||
      !signature
    ) {
      return new Response("BAD REQUEST", { status: 400 });
    }

    const expected = await hmacSha256Hex(
      `${merchantCode}${amount}${merchantOrderId}`,
      apiKey,
    );

    if (expected.toLowerCase() !== signature.toLowerCase()) {
      console.error("[DUITKU-LP-ORDER] Invalid callback signature", {
        merchantOrderId,
        amount,
      });
      return new Response("BAD SIGNATURE", { status: 401 });
    }

    if (resultCode === "00") {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const supabaseKey =
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
          Deno.env.get("SUPABASE_ANON_KEY") ||
          "";
        if (supabaseUrl && supabaseKey) {
          const supabase = createClient(supabaseUrl, supabaseKey);
          const { error } = await supabase
            .from("lp_orders")
            .update({
              status: "paid",
              duitku_reference: reference || null,
            })
            .eq("order_number", merchantOrderId)
            .eq("status", "pending");
          if (error) {
            console.warn(
              "[DUITKU-LP-ORDER] lp_orders update skipped:",
              error.message,
            );
          }
        }
      } catch (error) {
        console.warn(
          "[DUITKU-LP-ORDER] lp_orders update failed:",
          (error as Error).message,
        );
      }
    }

    return new Response("SUCCESS", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error(
      "[DUITKU-LP-ORDER] callback error:",
      error instanceof Error ? error.message : String(error),
    );
    return new Response("ERROR", { status: 500 });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Duitku mengirim callback sebagai form-urlencoded ke URL yang sama.
  // Tidak perlu function callback terpisah.
  const requestUrl = new URL(req.url);
  const contentType = req.headers.get("content-type") || "";
  const isCallback = requestUrl.searchParams.get("action") === "callback" ||
    (req.method === "POST" &&
      (contentType.includes("application/x-www-form-urlencoded") ||
        contentType.includes("multipart/form-data")));

  if (isCallback) {
    return await handleDuitkuCallback(req);
  }

  console.log(`[DUITKU-LP-ORDER] build ${FUNCTION_BUILD}`);

  try {
    const body = await req.json();
    const lpSlug = String(
      body?.lp_slug || body?.landing_page_source || "tinyhoney",
    ).trim().toLowerCase();
    const config = getLpConfig(lpSlug);

    const quantity = parseInt(String(body?.quantity ?? "1"), 10);
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
      throw new HttpError(400, "Jumlah produk tidak valid (1-99).");
    }

    const rateCode = readString(body?.rate_code, 100);
    if (!rateCode) {
      throw new HttpError(400, "rate_code wajib diisi.");
    }

    const receiver = {
      name: readString(body?.customer_name || body?.receiver_name, 120),
      phone: readString(body?.phone || body?.receiver_phone, 30),
      address: readString(body?.address || body?.receiver_address, 500),
      postalCode: readString(body?.postal_code || body?.receiver_postal_code, 12),
      subDistrictName: readString(
        body?.sub_district_name || body?.receiver_sub_district_name,
        120,
      ),
      districtName: readString(
        body?.district_name || body?.receiver_district_name,
        120,
      ),
      cityName: readString(body?.city_name || body?.receiver_city_name, 120),
      provinceName: readString(
        body?.province_name || body?.receiver_province_name,
        120,
      ),
    };

    if (!receiver.name) throw new HttpError(400, "Nama penerima wajib diisi.");
    if (!receiver.phone) throw new HttpError(400, "Nomor HP wajib diisi.");
    if (!receiver.address) throw new HttpError(400, "Alamat wajib diisi.");
    if (!receiver.postalCode) throw new HttpError(400, "Kode pos wajib diisi.");

    const paymentMethod = mapPaymentMethod(body?.payment_method);
    if (!paymentMethod) {
      throw new HttpError(400, "Metode pembayaran wajib dipilih.");
    }
    if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
      throw new HttpError(400, "Metode pembayaran tidak didukung.");
    }

    const productTotal = quantity * config.unitPrice;
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    if (!supabaseUrl) {
      throw new HttpError(500, "SUPABASE_URL belum dikonfigurasi.");
    }

    // Reuse lp-everpro-rates so the price and courier list come from the same
    // server-side configuration as the shipment gatekeeper.
    const ratesStartedAt = Date.now();
    const ratesResponse = await fetch(
      `${supabaseUrl}/functions/v1/lp-everpro-rates`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lp_slug: lpSlug,
          quantity,
          destination_postal_code: receiver.postalCode,
          destination_sub_district_name: receiver.subDistrictName,
          // The rates function ignores these for a known LP, but they keep
          // the request valid if the function is ever used generically.
          origin_postal_code: Deno.env.get("SHIPPER_POSTAL_CODE") || "40286",
          origin_sub_district_name: Deno.env.get("SHIPPER_SUB_DISTRICT_NAME") ||
            "Manjahlega",
        }),
      },
    );

    const ratesText = await ratesResponse.text();
    let ratesJson: any;
    try {
      ratesJson = JSON.parse(ratesText);
    } catch {
      ratesJson = { error: ratesText };
    }

    console.log(
      `[DUITKU-LP-ORDER] rates HTTP ${ratesResponse.status} in ${
        Date.now() - ratesStartedAt
      }ms`,
    );

    if (!ratesResponse.ok || ratesJson?.success === false) {
      throw new HttpError(
        502,
        `Gagal menghitung ongkir: ${ratesJson?.error || ratesText || "rates error"}`,
      );
    }

    const rates = flattenRates(ratesJson?.data ?? ratesJson);
    const selectedRate = selectRate(
      rates,
      rateCode,
      String(body?.courier_name || ""),
      String(body?.courier_service || ""),
    );
    const rawShippingPrice = Number(selectedRate?.price);
    if (!Number.isFinite(rawShippingPrice) || rawShippingPrice < 0) {
      throw new HttpError(502, "Ongkir yang dikembalikan kurir tidak valid.");
    }
    const shippingCost = normalizeRatePrice(rawShippingPrice);

    // The buyer sees a shipping discount. The server applies the discount to
    // the product value so Everpro's shipment_price stays equal to the rate.
    const shippingDiscount = quantity >= config.freeShippingMinQuantity
      ? Math.min(shippingCost, config.freeShippingMax, productTotal)
      : 0;
    const packagePrice = productTotal - shippingDiscount;
    const shippingPaid = shippingCost - shippingDiscount;
    const amount = packagePrice + shippingCost;

    if (amount < 1) {
      throw new HttpError(500, "Nominal pembayaran tidak valid.");
    }

    const duitku = getDuitkuConfig();
    if (!duitku.merchantCode || !duitku.apiKey) {
      throw new HttpError(500, "Kredensial Duitku belum dikonfigurasi.");
    }

    const orderNumber = `LP-${
      lpSlug.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)
    }-${Date.now()}-${
      crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()
    }`;

    const itemDetails: Array<{ name: string; price: number; quantity: number }> = [];
    if (packagePrice > 0) {
      itemDetails.push({
        name: `${config.productName} x${quantity}`,
        price: Math.round(packagePrice),
        quantity: 1,
      });
    }
    if (shippingCost > 0) {
      const courierLabel = [
        selectedRate?.logistic_name,
        selectedRate?.rate_name,
      ].filter(Boolean).join(" - ");
      itemDetails.push({
        name: `Ongkir ${courierLabel || "kurir"}`.slice(0, 255),
        price: Math.round(shippingCost),
        quantity: 1,
      });
    }

    const itemTotal = itemDetails.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    if (itemTotal !== amount) {
      throw new HttpError(500, "Rincian pembayaran tidak cocok.");
    }

    const returnUrl = resolveReturnUrl(req, body);
    // Callback ditangani oleh function yang sama, jadi tidak perlu
    // function/endpoint baru.
    const callbackUrl = Deno.env.get("DUITKU_CALLBACK_URL") ||
      `${supabaseUrl}/functions/v1/duitku-lp-order?action=callback`;
    console.log(
      `[DUITKU-LP-ORDER] callback URL=${callbackUrl} return URL=${returnUrl}`,
    );
    const email = Deno.env.get("DUITKU_DEFAULT_EMAIL") || "admin@tinyhoney.id";
    const phone = receiver.phone.replace(/[^0-9+]/g, "").slice(0, 50);
    const customerName = receiver.name.slice(0, 20) || "TinyHoney Buyer";

    const customerDetail = {
      firstName: customerName,
      lastName: "",
      email,
      phoneNumber: phone,
      billingAddress: {
        firstName: customerName,
        lastName: "",
        address: receiver.address.slice(0, 255),
        city: receiver.cityName.slice(0, 255),
        postalCode: receiver.postalCode,
        phone,
        countryCode: "ID",
      },
      shippingAddress: {
        firstName: customerName,
        lastName: "",
        address: receiver.address.slice(0, 255),
        city: receiver.cityName.slice(0, 255),
        postalCode: receiver.postalCode,
        phone,
        countryCode: "ID",
      },
    };

    // Duitku v2 inquiry signature: HMAC-SHA256(merchantCode + orderId + amount)
    const signature = await hmacSha256Hex(
      `${duitku.merchantCode}${orderNumber}${amount}`,
      duitku.apiKey,
    );

    const payload = {
      merchantCode: duitku.merchantCode,
      paymentAmount: amount,
      paymentMethod,
      merchantOrderId: orderNumber,
      productDetails: `${config.productName} x${quantity}`,
      additionalParam: encodeURIComponent(JSON.stringify({
        lp_slug: lpSlug,
        quantity,
        rate_code: selectedRate?.rate_code || rateCode,
      })),
      merchantUserInfo: "",
      customerVaName: customerName,
      email,
      phoneNumber: phone,
      itemDetails,
      customerDetail,
      callbackUrl,
      returnUrl,
      signature,
      expiryPeriod: envInt("DUITKU_EXPIRY_MINUTES", 60),
    };

    console.log(
      `[DUITKU-LP-ORDER] Creating ${orderNumber} amount=${amount} method=${paymentMethod} rate=${selectedRate?.rate_code || rateCode}`,
    );
    console.log(
      `[DUITKU-LP-ORDER] inquiry URL=${duitku.inquiryUrl} env=${
        duitku.isProduction ? "production" : "sandbox"
      }`,
    );

    const inquiryStartedAt = Date.now();
    let duitkuResponse: Response;
    try {
      duitkuResponse = await fetchDuitkuInquiry(duitku.inquiryUrl, payload);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        const timeoutMessage = paymentMethod === "SP"
          ? "QRIS sedang tidak merespons. Coba pilih BCA Virtual Account atau metode pembayaran lain."
          : `Duitku tidak merespons dalam 20 detik (metode ${paymentMethod}). Coba lagi atau pilih metode pembayaran lain.`;
        throw new HttpError(504, timeoutMessage);
      }
      throw error;
    }
    console.log(
      `[DUITKU-LP-ORDER] inquiry HTTP ${duitkuResponse.status} in ${
        Date.now() - inquiryStartedAt
      }ms`,
    );

    const duitkuText = await duitkuResponse.text();
    let duitkuJson: any;
    try {
      duitkuJson = JSON.parse(duitkuText);
    } catch {
      duitkuJson = { raw: duitkuText };
    }

    if (
      !duitkuResponse.ok ||
      String(duitkuJson?.statusCode || "") !== "00" ||
      !duitkuJson?.paymentUrl
    ) {
      console.error("[DUITKU-LP-ORDER] Duitku inquiry failed:", duitkuText);
      const detail = duitkuJson?.statusMessage ||
        duitkuJson?.Message ||
        duitkuText ||
        "inquiry error";
      const message = duitkuResponse.status >= 500
        ? `Duitku sedang tidak dapat memproses pembayaran (HTTP ${duitkuResponse.status}). Coba lagi atau pilih metode pembayaran lain.`
        : `Duitku gagal membuat transaksi (HTTP ${duitkuResponse.status}): ${detail}`;
      throw new HttpError(502, message);
    }

    // Store a snapshot when the table exists. This is best-effort: a missing
    // table must not block a valid payment. The snapshot is what a future
    // create-order revision can trust instead of the request body.
    try {
      const supabaseKey =
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
        Deno.env.get("SUPABASE_ANON_KEY") ||
        "";
      if (supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { error } = await supabase.from("lp_orders").insert({
          order_number: orderNumber,
          lp_slug: lpSlug,
          status: "pending",
          quantity,
          unit_price: config.unitPrice,
          product_total: productTotal,
          shipping_cost: shippingCost,
          shipping_discount: shippingDiscount,
          amount,
          rate_code: selectedRate?.rate_code || rateCode,
          logistic_code: selectedRate?.logistic_code || "",
          courier_name: selectedRate?.logistic_name || "",
          courier_service: selectedRate?.rate_name || "",
          receiver_name: receiver.name,
          receiver_phone: receiver.phone,
          receiver_address: receiver.address,
          receiver_postal_code: receiver.postalCode,
          receiver_sub_district_name: receiver.subDistrictName,
          receiver_district_name: receiver.districtName,
          receiver_city_name: receiver.cityName,
          receiver_province_name: receiver.provinceName,
          duitku_reference: duitkuJson?.reference || null,
        });
        if (error) {
          console.warn(
            "[DUITKU-LP-ORDER] lp_orders snapshot skipped:",
            error.message,
          );
        }
      }
    } catch (snapshotError) {
      console.warn(
        "[DUITKU-LP-ORDER] lp_orders snapshot failed:",
        (snapshotError as Error).message,
      );
    }

    return jsonResponse({
      success: true,
      order_number: orderNumber,
      environment: duitku.isProduction ? "production" : "sandbox",
      amount,
      pricing: {
        unit_price: config.unitPrice,
        product_total: productTotal,
        product_discount: shippingDiscount,
        package_price: packagePrice,
        shipping_cost: shippingCost,
        shipping_discount: shippingDiscount,
        shipping_paid: shippingPaid,
        total: amount,
      },
      shipping: {
        rate_code: selectedRate?.rate_code || rateCode,
        logistic_code: selectedRate?.logistic_code || "",
        courier_name: selectedRate?.logistic_name || "",
        courier_service: selectedRate?.rate_name || "",
        cost: shippingCost,
        discount: shippingDiscount,
        paid: shippingPaid,
      },
      duitku: {
        merchantCode: duitkuJson?.merchantCode || duitku.merchantCode,
        reference: duitkuJson?.reference || "",
        paymentUrl: duitkuJson.paymentUrl,
        qrString: duitkuJson?.qrString || "",
        amount: duitkuJson?.amount || String(amount),
        statusCode: duitkuJson?.statusCode || "",
        statusMessage: duitkuJson?.statusMessage || "",
      },
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    console.error("[DUITKU-LP-ORDER] Error:", message);
    return jsonResponse({ success: false, error: message }, status);
  }
});
