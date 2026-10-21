import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Visible marker so the deployed logs prove which build is running.
const FUNCTION_BUILD = "2026-10-21-kg";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name, *",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
};

function asPositiveInt(value: unknown, fallback: number): number {
  const parsed = parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// The LP sends weight in grams; Everpro expects kilograms.
function asWeightKg(value: unknown, fallbackGram = 1000): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackGram / 1000;
  return Math.max(0.001, parsed / 1000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log(`[LP-EVERPRO-RATES] build ${FUNCTION_BUILD}`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_ANON_KEY") ||
      "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    console.log("[LP-EVERPRO-RATES] Received request body:", JSON.stringify(body));

    const {
      lp_slug = "tinyhoney",
      origin_postal_code,
      origin_sub_district_name,
      destination_postal_code,
      destination_sub_district_name,
      weight = 1000,
      item_price = 150000,
      width = 10,
      height = 10,
      length = 10,
      is_cod = false,
      is_use_insurance = false,
      package_type_id = 1,
      shipment_type = "PICKUP",
      logistic_codes,
    } = body || {};

    // 1. Resolve LP Everpro credentials from Supabase secrets or LandingPage_Config.
    let lpEverproKey = Deno.env.get("EVERPRO_LP_CLIENT_KEY");
    let lpEverproSecret = Deno.env.get("EVERPRO_LP_CLIENT_SECRET");
    let lpEverproApiUrl = Deno.env.get("EVERPRO_LP_API_URL");

    const resolvedSlug = String(lp_slug || "tinyhoney").toLowerCase();
    if (resolvedSlug) {
      try {
        const { data: lpConf } = await supabase
          .from("LandingPage_Config")
          .select("*")
          .eq("lp_slug", resolvedSlug)
          .maybeSingle();

        if (lpConf) {
          if (lpConf.everpro_client_key) lpEverproKey = lpConf.everpro_client_key;
          if (lpConf.everpro_client_secret) lpEverproSecret = lpConf.everpro_client_secret;
          if (lpConf.everpro_api_url) lpEverproApiUrl = lpConf.everpro_api_url;
        }
      } catch (e) {
        console.warn("[LP-EVERPRO-RATES] LandingPage_Config query warning:", (e as Error).message);
      }
    }

    if (!lpEverproKey || !lpEverproSecret || !lpEverproApiUrl) {
      throw new Error(
        `Everpro credentials/API URL for LP (${resolvedSlug}) are not configured. ` +
          "Set EVERPRO_LP_CLIENT_KEY, EVERPRO_LP_CLIENT_SECRET, and EVERPRO_LP_API_URL.",
      );
    }

    const cleanApiUrl = String(lpEverproApiUrl).replace(/\/$/, "");

    // 2. Authenticate with Everpro.
    const authResp = await fetch(`${cleanApiUrl}/auth/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_key: lpEverproKey,
        client_secret: lpEverproSecret,
      }),
    });

    const authJson = await authResp.json();
    const token = authJson?.data?.token || authJson?.token;
    if (!authResp.ok || !token) {
      throw new Error(`Everpro authentication failed: ${JSON.stringify(authJson)}`);
    }

    // 3. Resolve origin/destination.
    const originPostal = String(origin_postal_code || Deno.env.get("SHIPPER_POSTAL_CODE") || "").trim();
    const destinationPostal = String(destination_postal_code || "").trim();

    if (!originPostal || !destinationPostal) {
      throw new Error("origin_postal_code and destination_postal_code are required for rate calculation.");
    }

    // Everpro V2 rates expects snake_case and weight in kilograms.
    const ratesPayload: Record<string, unknown> = {
      origin_postal_code: originPostal,
      destination_postal_code: destinationPostal,
      weight: asWeightKg(weight),
      item_price: asPositiveInt(item_price, 150000),
      is_cod: Boolean(is_cod),
      is_use_insurance: Boolean(is_use_insurance),
      package_type_id: asPositiveInt(package_type_id, 1),
      shipment_type: String(shipment_type || "PICKUP").toUpperCase(),
      width: asPositiveInt(width, 10),
      height: asPositiveInt(height, 10),
      length: asPositiveInt(length, 10),
    };

    if (origin_sub_district_name) {
      ratesPayload.origin_sub_district_name = String(origin_sub_district_name).trim();
    }
    if (destination_sub_district_name) {
      ratesPayload.destination_sub_district_name = String(destination_sub_district_name).trim();
    }
    if (logistic_codes) {
      ratesPayload.logistic_codes = logistic_codes;
    }

    console.log(
      `[LP-EVERPRO-RATES] Fetching rates from ${cleanApiUrl}/shipment/v2/rates`,
      JSON.stringify(ratesPayload),
    );

    const ratesResp = await fetch(`${cleanApiUrl}/shipment/v2/rates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(ratesPayload),
    });

    const ratesText = await ratesResp.text();
    let ratesJson: unknown;
    try {
      ratesJson = JSON.parse(ratesText);
    } catch {
      ratesJson = { error: ratesText };
    }

    if (!ratesResp.ok) {
      console.error(`[LP-EVERPRO-RATES] Rates API returned status ${ratesResp.status}:`, ratesText);
    }

    return new Response(JSON.stringify(ratesJson), {
      status: ratesResp.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[LP-EVERPRO-RATES] Error:", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
