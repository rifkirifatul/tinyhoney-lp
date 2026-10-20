// main.js — loaded with <script defer src="js/main.js"></script>

(function () {
  'use strict';

  // --- WhatsApp Link Module ---

  /**
   * Builds a WhatsApp wa.me URL from phone number and message.
   * Pure function — no side effects.
   * @param {string} phone - Phone number (any format, non-digits stripped)
   * @param {string} message - Pre-filled message text
   * @returns {string} wa.me URL with URL-encoded message
   */
  function buildWhatsAppUrl(phone, message) {
    var cleanPhone = phone.replace(/\D/g, '');
    var encodedMessage = encodeURIComponent(message);
    return 'https://wa.me/' + cleanPhone + '?text=' + encodedMessage;
  }

  /**
   * Builds the pre-filled WhatsApp message for TinyHoney.
   * Pure function — no side effects.
   * @returns {string} Pre-filled message referencing product, consultation, and order
   */
  function buildWhatsAppMessage() {
    return 'Halo Bunda, Aku tertarik dan mau konsultasi seputar produk Tinyhoney nya bun ^^';
  }

  var WHATSAPP_CONFIG = {
    phone: '6289503263580',  // TODO: Replace with seller's actual WhatsApp number
    message: buildWhatsAppMessage()
  };

  // --- Checkout / Duitku Payment Module ---

  var CHECKOUT_CONFIG = {
    // Centralized Supabase Edge Function that creates the Duitku transaction.
    endpoint: 'https://bdvirbyivvoifdrvvjgb.supabase.co/functions/v1/duitku-lp-order',
    unitPrice: 129000,               // Promo price per bottle (Rp)
    productName: '1 Botol TinyHoney',
    landingPageSource: 'tinyhoney',
    notes: 'Pesanan via LP Tiny Honey',
    freeShippingMax: 30000           // Promo FREE ONGKIR max. Rp30.000
  };

  // --- Everpro shipping integration ---
  // These are the existing Edge Functions used by the main website.
  var EVERPRO_CONFIG = {
    base: 'https://bdvirbyivvoifdrvvjgb.supabase.co/functions/v1',
    provincesEndpoint: 'https://bdvirbyivvoifdrvvjgb.supabase.co/functions/v1/everpro-provinces',
    citiesEndpoint: 'https://bdvirbyivvoifdrvvjgb.supabase.co/functions/v1/everpro-cities',
    districtsEndpoint: 'https://bdvirbyivvoifdrvvjgb.supabase.co/functions/v1/everpro-districts',
    subdistrictsEndpoint: 'https://bdvirbyivvoifdrvvjgb.supabase.co/functions/v1/everpro-subdistricts',
    ratesEndpoint: 'https://bdvirbyivvoifdrvvjgb.supabase.co/functions/v1/everpro-rates',
    logisticsEndpoint: 'https://bdvirbyivvoifdrvvjgb.supabase.co/functions/v1/everpro-logistics',

    // Shipper origin (TinyHoney warehouse).
    originPostalCode: '40286',
    originSubDistrictName: 'Manjahlega',
    originAddress: 'Jl. Saturnus Tengah I No. 1, Manjahlega, Rancasari, Kota Bandung, Jawa Barat 40286',

    // Product package defaults used for rate calculation.
    weightPerItemGram: 500,
    lengthCm: 10,
    widthCm: 10,
    heightCm: 15,
    packageTypeId: 1,
    shipmentType: 'DROP',

    // Everpro returns rate prices in cents (sen); convert to Rupiah.
    ratePriceDivisor: 100,

    // Ignore non-Indonesian sample rows if Everpro returns them.
    excludedProvinceNames: ['Zhambyl 905']
  };

  /**
   * Returns the clean URL of this landing page (without query/hash) so Duitku
   * can redirect the buyer back here after the payment page.
   * Pure-ish helper (reads window when available).
   * @returns {string}
   */
  function getReturnUrl() {
    if (typeof window === 'undefined' || !window.location) { return ''; }
    return window.location.origin + window.location.pathname;
  }

  /**
   * Maps a Duitku payment method code to a human readable name.
   * Pure function.
   * @param {string} code
   * @returns {string}
   */
  function getPaymentMethodName(code) {
    var map = {
      'BC': 'BCA Virtual Account',
      'M2': 'Mandiri Virtual Account',
      'SP': 'QRIS',
      'I1': 'BNI Virtual Account',
      'BT': 'Permata Virtual Account',
      'AL': 'Alfamart',
      'ID': 'Indomaret'
    };
    return map[code] || code || '-';
  }

  /**
   * Builds the WhatsApp confirmation message for a completed order.
   * Pure function.
   * @param {object} details
   * @returns {string}
   */
  function buildOrderWhatsAppMessage(details) {
    details = details || {};
    var qty = parseInt(details.quantity, 10) || 1;
    var amount = (typeof details.amount === 'number')
      ? details.amount
      : computeAmount(qty, CHECKOUT_CONFIG.unitPrice);
    var lines = [];
    lines.push('Halo Admin, saya sudah melakukan pembayaran. Mohon konfirmasi pesanan saya.');
    lines.push('');
    lines.push('Detail Pesanan:');
    lines.push('- Produk: ' + (details.product_name || CHECKOUT_CONFIG.productName));
    lines.push('- Jumlah: ' + qty);
    if (details.subtotal) { lines.push('- Subtotal: ' + formatRupiah(details.subtotal)); }
    if (details.courier_name) {
      lines.push('- Kurir: ' + details.courier_name +
        (details.courier_service ? ' (' + details.courier_service + ')' : '') +
        (details.courier_etd ? ' - estimasi ' + details.courier_etd : ''));
    }
    if (details.shipping_cost !== undefined && details.shipping_cost !== null) {
      lines.push('- Ongkir: ' + formatRupiah(details.shipping_cost));
    }
    if (details.shipping_discount) {
      lines.push('- Diskon Ongkir: -' + formatRupiah(details.shipping_discount));
    }
    lines.push('- Total: ' + formatRupiah(amount));
    lines.push('- Metode Pembayaran: ' + getPaymentMethodName(details.payment_method));
    if (details.order_number) { lines.push('- No. Order: ' + details.order_number); }
    if (details.reference) { lines.push('- Kode Referensi Duitku: ' + details.reference); }
    lines.push('');
    lines.push('Detail Pembeli:');
    lines.push('- Nama: ' + (details.customer_name || '-'));
    lines.push('- No. HP: ' + (details.phone || '-'));
    lines.push('- Alamat: ' + (details.destination || details.address || '-'));
    if (details.weight_gram) { lines.push('- Berat: ' + details.weight_gram + ' gram'); }
    lines.push('');
    lines.push('Terima kasih.');
    return lines.join('\n');
  }

  /**
   * Reads the stored checkout payload (if any) from sessionStorage.
   * @returns {object|null}
   */
  function getStoredCheckout() {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage) { return null; }
      var raw = window.sessionStorage.getItem('tinyhoney_checkout');
      if (!raw) { return null; }
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /**
   * Computes the order total from quantity and unit price.
   * Pure function — no side effects.
   * @param {number|string} quantity
   * @param {number} unitPrice
   * @returns {number} Amount in Rupiah (minimum 1 × unitPrice)
   */
  function computeAmount(quantity, unitPrice) {
    var qty = parseInt(quantity, 10);
    if (!qty || qty < 1) { qty = 1; }
    return qty * unitPrice;
  }

  /**
   * Small fetch wrapper that returns parsed JSON and throws on non-2xx.
   * @param {string} url
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  async function fetchJson(url, options) {
    var response = await fetch(url, options);
    var body = null;
    try { body = await response.json(); } catch (e) { body = null; }
    if (!response.ok) {
      var message = (body && (body.message || body.error)) || ('HTTP ' + response.status);
      throw new Error(message);
    }
    return body || {};
  }

  /**
   * Everpro returns rates in cents; normalize to Rupiah.
   * Pure function.
   * @param {number|string} price
   * @returns {number}
   */
  function normalizeRatePrice(price) {
    var n = Number(price);
    if (!isFinite(n) || n < 0) { return 0; }
    return Math.round(n / EVERPRO_CONFIG.ratePriceDivisor);
  }

  /**
   * Promo discount for shipping (FREE ONGKIR max. Rp30.000).
   * Pure function.
   * @param {number|string} shippingCost
   * @returns {number}
   */
  function computeShippingDiscount(shippingCost) {
    var cost = Number(shippingCost) || 0;
    if (cost < 0) { cost = 0; }
    return Math.min(cost, CHECKOUT_CONFIG.freeShippingMax || 0);
  }

  /**
   * Shipping amount actually paid by the buyer after the promo discount.
   * Pure function.
   * @param {number|string} shippingCost
   * @returns {number}
   */
  function computeShippingPaid(shippingCost) {
    var cost = Number(shippingCost) || 0;
    if (cost < 0) { cost = 0; }
    return cost - computeShippingDiscount(cost);
  }

  /**
   * Flattens the grouped Everpro rate response into a single sorted list.
   * Pure function.
   * @param {object} data - response.data from everpro-rates
   * @returns {Array<object>}
   */
  function flattenRates(data) {
    if (!data) { return []; }
    var groups = ['regular', 'express', 'same_day', 'instant', 'cargo', 'vehicle'];
    var out = [];
    var i;
    var j;
    for (i = 0; i < groups.length; i++) {
      var list = data[groups[i]];
      if (!list || !list.length) { continue; }
      for (j = 0; j < list.length; j++) {
        var rate = list[j];
        var price = normalizeRatePrice(rate.price);
        if (price <= 0) { continue; }
        out.push({
          group: groups[i],
          logistic_code: rate.logistic_code || '',
          logistic_name: rate.logistic_name || '',
          rate_code: rate.rate_code || '',
          rate_name: rate.rate_name || '',
          min_duration: rate.min_duration || 0,
          max_duration: rate.max_duration || 0,
          duration_type: rate.duration_type || 'DAY',
          price: price,
          weight: rate.weight || 0,
          signed_key: rate.signed_key || ''
        });
      }
    }
    out.sort(function (a, b) { return a.price - b.price; });
    return out;
  }

  /**
   * Builds the request body expected by the Everpro rates Edge Function.
   * Pure function.
   * @param {object} values
   * @returns {object}
   */
  function buildRatesPayload(values) {
    var qty = parseInt(values.quantity, 10) || 1;
    var weight = qty * EVERPRO_CONFIG.weightPerItemGram;
    return {
      origin_postal_code: EVERPRO_CONFIG.originPostalCode,
      origin_sub_district_name: EVERPRO_CONFIG.originSubDistrictName,
      destination_postal_code: values.postal_code,
      destination_sub_district_name: values.sub_district_name,
      weight: weight,
      length: EVERPRO_CONFIG.lengthCm,
      width: EVERPRO_CONFIG.widthCm,
      height: EVERPRO_CONFIG.heightCm,
      shipment_type: EVERPRO_CONFIG.shipmentType,
      package_type_id: EVERPRO_CONFIG.packageTypeId,
      item_price: computeAmount(qty, CHECKOUT_CONFIG.unitPrice),
      is_cod: false,
      is_use_insurance: false
    };
  }

  /**
   * Formats the courier ETA, e.g. "1-2 hari".
   * Pure function.
   * @param {object} rate
   * @returns {string}
   */
  function formatShippingEta(rate) {
    if (!rate) { return ''; }
    var min = rate.min_duration || 0;
    var max = rate.max_duration || 0;
    var unit = (rate.duration_type === 'DAY') ? 'hari' : (rate.duration_type || '').toLowerCase();
    if (min && max && min !== max) { return min + '-' + max + ' ' + unit; }
    if (max) { return max + ' ' + unit; }
    if (min) { return min + ' ' + unit; }
    return '';
  }

  /**
   * Builds a readable destination label from form values.
   * Pure function.
   * @param {object} values
   * @returns {string}
   */
  function buildDestinationLabel(values) {
    if (!values) { return ''; }
    var parts = [];
    if (values.address) { parts.push(values.address); }
    if (values.sub_district_name) { parts.push(values.sub_district_name); }
    if (values.district_name) { parts.push(values.district_name); }
    if (values.city_name) { parts.push(values.city_name); }
    if (values.province_name) { parts.push(values.province_name); }
    if (values.postal_code) { parts.push(values.postal_code); }
    return parts.join(', ');
  }

  /**
   * Formats a number as Rupiah, e.g. 129000 -> "Rp129.000".
   * Pure function — no side effects.
   * @param {number} amount
   * @returns {string}
   */
  function formatRupiah(amount) {
    return 'Rp' + Number(amount).toLocaleString('id-ID');
  }

  /**
   * Builds the JSON payload for the Duitku LP Edge Function.
   * Pure function — no side effects.
   * @param {{customer_name:string, phone:string, address:string, quantity:number|string, payment_method:string}} values
   * @returns {object}
   */
  function buildOrderPayload(values) {
    var qty = parseInt(values.quantity, 10) || 1;
    var subtotal = computeAmount(qty, CHECKOUT_CONFIG.unitPrice);
    var shippingCost = (values.shipping_cost === undefined || values.shipping_cost === null)
      ? 0
      : Number(values.shipping_cost) || 0;
    var shippingDiscount = (values.shipping_discount === undefined || values.shipping_discount === null)
      ? 0
      : Number(values.shipping_discount) || 0;
    var shippingPaid = (values.shipping_paid === undefined || values.shipping_paid === null)
      ? Math.max(0, shippingCost - shippingDiscount)
      : Number(values.shipping_paid) || 0;

    var payload = {
      product_name: CHECKOUT_CONFIG.productName,
      amount: subtotal + shippingPaid,
      quantity: qty,
      customer_name: values.customer_name,
      phone: values.phone,
      address: values.address,
      payment_method: values.payment_method,
      landing_page_source: CHECKOUT_CONFIG.landingPageSource,
      notes: CHECKOUT_CONFIG.notes,
      return_url: getReturnUrl(),
      returnUrl: getReturnUrl()
    };

    if (values.shipping_cost !== undefined && values.shipping_cost !== null) {
      payload.subtotal = subtotal;
      payload.shipping_cost = shippingCost;
      payload.shipping_discount = shippingDiscount;
      payload.shipping_paid = shippingPaid;
      payload.province_name = values.province_name || '';
      payload.city_name = values.city_name || '';
      payload.district_name = values.district_name || '';
      payload.sub_district_name = values.sub_district_name || '';
      payload.postal_code = values.postal_code || '';
      payload.destination = buildDestinationLabel(values);
      payload.origin_postal_code = EVERPRO_CONFIG.originPostalCode;
      payload.origin_sub_district_name = EVERPRO_CONFIG.originSubDistrictName;
      payload.origin_address = EVERPRO_CONFIG.originAddress;
      payload.courier_code = values.courier_code || '';
      payload.courier_name = values.courier_name || '';
      payload.courier_service = values.courier_service || '';
      payload.courier_etd = values.courier_etd || '';
      payload.weight_gram = qty * EVERPRO_CONFIG.weightPerItemGram;
    }

    return payload;
  }

  /**
   * Sends the order to the Edge Function and redirects to the Duitku payment
   * page on success. Side-effectful (network + navigation + alerts).
   * @param {object} values - Form values
   * @returns {Promise<void>}
   */
  async function handleLpCheckout(values) {
    try {
      var response = await fetch(CHECKOUT_CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildOrderPayload(values))
      });

      var result = await response.json();

      if (result.success && result.duitku && result.duitku.paymentUrl) {
        try {
          if (typeof window !== 'undefined' && window.sessionStorage) {
            if (result.order_number) {
              window.sessionStorage.setItem('tinyhoney_last_order', result.order_number);
            }
            if (result.duitku.reference) {
              window.sessionStorage.setItem('tinyhoney_last_reference', result.duitku.reference);
            }
            var qty = parseInt(values.quantity, 10) || 1;
            var subtotal = computeAmount(qty, CHECKOUT_CONFIG.unitPrice);
            var shippingCost = Number(values.shipping_cost) || 0;
            var shippingDiscount = (values.shipping_discount === undefined || values.shipping_discount === null)
              ? 0
              : Number(values.shipping_discount) || 0;
            var shippingPaid = (values.shipping_paid === undefined || values.shipping_paid === null)
              ? Math.max(0, shippingCost - shippingDiscount)
              : Number(values.shipping_paid) || 0;
            window.sessionStorage.setItem('tinyhoney_checkout', JSON.stringify({
              customer_name: values.customer_name,
              phone: values.phone,
              address: values.address,
              quantity: qty,
              payment_method: values.payment_method,
              subtotal: subtotal,
              shipping_cost: shippingCost,
              shipping_discount: shippingDiscount,
              shipping_paid: shippingPaid,
              amount: subtotal + shippingPaid,
              province_name: values.province_name || '',
              city_name: values.city_name || '',
              district_name: values.district_name || '',
              sub_district_name: values.sub_district_name || '',
              postal_code: values.postal_code || '',
              destination: buildDestinationLabel(values),
              courier_code: values.courier_code || '',
              courier_name: values.courier_name || '',
              courier_service: values.courier_service || '',
              courier_etd: values.courier_etd || '',
              weight_gram: qty * EVERPRO_CONFIG.weightPerItemGram,
              order_number: result.order_number || null,
              reference: result.duitku.reference || null
            }));
          }
        } catch (storageErr) { /* ignore */ }
        // Seamless redirect to the Duitku payment page (sandbox/production)
        window.location.href = result.duitku.paymentUrl;
      } else {
        alert('Gagal membuat transaksi: ' + (result.error || 'Terjadi kesalahan'));
      }
    } catch (err) {
      console.error('Checkout Error:', err);
      alert('Terjadi kesalahan koneksi pembayaran.');
    }
  }

  /**
   * Reads a query parameter from a URLSearchParams-like object, trying several
   * common casings/names used by Duitku redirects.
   * @param {URLSearchParams} params
   * @param {string[]} names
   * @returns {string|null}
   */
  function getRedirectParam(params, names) {
    var i;
    for (i = 0; i < names.length; i++) {
      var v = params.get(names[i]);
      if (v !== null && v !== undefined && String(v) !== '') { return v; }
    }
    return null;
  }

  /**
   * Parses the Duitku redirect query string that is appended to the returnUrl
   * after the buyer leaves the Duitku payment page.
   * Pure-ish function (no side effects) — accepts an optional search string
   * (defaults to window.location.search).
   * @param {string} [search]
   * @returns {{merchantOrderId:string|null, resultCode:string|null, reference:string|null}|null}
   */
  function parseDuitkuRedirect(search) {
    var qs = (search === undefined)
      ? (typeof window !== 'undefined' && window.location ? window.location.search : '')
      : search;
    if (!qs) { return null; }
    var params;
    try { params = new URLSearchParams(qs.charAt(0) === '?' ? qs : '?' + qs); }
    catch (e) { return null; }

    var merchantOrderId = getRedirectParam(params, ['merchantOrderId', 'merchant_order_id', 'merchantOrderId', 'orderId', 'order_id']);
    var resultCode = getRedirectParam(params, ['resultCode', 'result_code', 'resultcode']);
    var reference = getRedirectParam(params, ['reference', 'duitkuReference']);

    if (merchantOrderId === null && resultCode === null && reference === null) {
      return null;
    }
    return {
      merchantOrderId: merchantOrderId,
      resultCode: resultCode,
      reference: reference
    };
  }

  /**
   * Maps a Duitku resultCode to a human readable status.
   * Pure function.
   * @param {string|null} resultCode
   * @returns {'success'|'pending'|'canceled'|'unknown'}
   */
  function getDuitkuRedirectStatus(resultCode) {
    if (resultCode === '00') { return 'success'; }
    if (resultCode === '01') { return 'pending'; }
    if (resultCode === '02') { return 'canceled'; }
    return 'unknown';
  }

  /**
   * Returns a user-facing message for a Duitku redirect resultCode.
   * Pure function.
   * @param {string|null} resultCode
   * @returns {string}
   */
  function getDuitkuRedirectMessage(resultCode) {
    var status = getDuitkuRedirectStatus(resultCode);
    if (status === 'success') { return 'Pembayaran berhasil. Terima kasih, Bunda!'; }
    if (status === 'pending') { return 'Pembayaran sedang diproses. Mohon tunggu konfirmasi.'; }
    if (status === 'canceled') { return 'Pembayaran dibatalkan. Silakan coba lagi.'; }
    return 'Status pembayaran tidak diketahui' + (resultCode ? ' (kode: ' + resultCode + ')' : '') + '.';
  }

  /**
   * Handles the Duitku redirect back to this landing page (if any).
   * Shows a status message and cleans the URL. Side-effectful.
   * @returns {object|null}
   */
  function handleDuitkuRedirect() {
    if (typeof window === 'undefined') { return null; }
    var info = parseDuitkuRedirect(window.location.search);
    if (!info) { return null; }

    var status = getDuitkuRedirectStatus(info.resultCode);
    var message = getDuitkuRedirectMessage(info.resultCode);
    if (info.merchantOrderId) {
      message = message + ' Order: ' + info.merchantOrderId + '.';
    }

    // Surface the result in the DOM as well, if a container exists.
    try {
      var banner = document.getElementById('payment-result');
      if (banner) {
        banner.textContent = message;
        banner.removeAttribute('hidden');
        banner.setAttribute('data-status', status);
      }
    } catch (e) { /* ignore */ }

    // On successful payment, redirect to WhatsApp with the order payload so the
    // buyer can confirm to the admin with a single tap on "Send".
    if (status === 'success') {
      var stored = null;
      try {
        if (window.sessionStorage) {
          var raw = window.sessionStorage.getItem('tinyhoney_checkout');
          if (raw) { stored = JSON.parse(raw); }
        }
      } catch (e) { stored = null; }

      var orderNumber = info.merchantOrderId ||
        (stored && stored.order_number) ||
        (window.sessionStorage ? window.sessionStorage.getItem('tinyhoney_last_order') : null);
      var reference = info.reference ||
        (stored && stored.reference) ||
        (window.sessionStorage ? window.sessionStorage.getItem('tinyhoney_last_reference') : null);

      var details = {
        customer_name: stored ? stored.customer_name : '',
        phone: stored ? stored.phone : '',
        address: stored ? stored.address : '',
        quantity: stored ? stored.quantity : 1,
        payment_method: stored ? stored.payment_method : '',
        subtotal: stored ? stored.subtotal : null,
        shipping_cost: stored ? stored.shipping_cost : null,
        shipping_discount: stored ? stored.shipping_discount : null,
        shipping_paid: stored ? stored.shipping_paid : null,
        amount: stored ? stored.amount : computeAmount(stored ? stored.quantity : 1, CHECKOUT_CONFIG.unitPrice),
        product_name: CHECKOUT_CONFIG.productName,
        destination: stored ? stored.destination : '',
        courier_name: stored ? stored.courier_name : '',
        courier_service: stored ? stored.courier_service : '',
        courier_etd: stored ? stored.courier_etd : '',
        weight_gram: stored ? stored.weight_gram : null,
        order_number: orderNumber,
        reference: reference
      };

      var waMessage = buildOrderWhatsAppMessage(details);
      var waUrl = buildWhatsAppUrl(WHATSAPP_CONFIG.phone, waMessage);

      // Clean up stored checkout data so it is not reused accidentally.
      try {
        if (window.sessionStorage) {
          window.sessionStorage.removeItem('tinyhoney_checkout');
        }
      } catch (e) { /* ignore */ }

      // Remove the redirect query params, then go to WhatsApp.
      try {
        if (window.history && typeof window.history.replaceState === 'function') {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        }
      } catch (e) { /* ignore */ }

      try {
        window.location.href = waUrl;
      } catch (e) { /* ignore */ }

      return {
        merchantOrderId: info.merchantOrderId,
        resultCode: info.resultCode,
        reference: info.reference,
        status: status,
        message: message,
        whatsappUrl: waUrl,
        whatsappMessage: waMessage
      };
    }

    // Non-success: notify the buyer and clean the URL.
    try {
      if (typeof window.alert === 'function') { window.alert(message); }
    } catch (e) { /* ignore */ }

    try {
      if (window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
      }
    } catch (e) { /* ignore */ }

    return {
      merchantOrderId: info.merchantOrderId,
      resultCode: info.resultCode,
      reference: info.reference,
      status: status,
      message: message
    };
  }

  /**
   * Wires the checkout modal: open/close, live total, and submit → Duitku.
   * Side-effectful (DOM listeners).
   * @returns {void}
   */
  function initCheckoutModal() {
    var modal = document.getElementById('checkout-modal');
    var form = document.getElementById('checkout-form');
    if (!modal || !form) { return; }

    var qtyInput = document.getElementById('lp-quantity');
    var nameInput = document.getElementById('lp-name');
    var phoneInput = document.getElementById('lp-phone');
    var addressInput = document.getElementById('lp-address');
    var provinceSelect = document.getElementById('lp-province');
    var citySelect = document.getElementById('lp-city');
    var districtSelect = document.getElementById('lp-district');
    var subdistrictSelect = document.getElementById('lp-subdistrict');
    var postalInput = document.getElementById('lp-postal-code');
    var paymentSelect = document.getElementById('lp-payment');

    var next1Btn = document.getElementById('checkout-next-1');
    var back2Btn = document.getElementById('checkout-back-2');
    var next2Btn = document.getElementById('checkout-next-2');
    var back3Btn = document.getElementById('checkout-back-3');
    var checkRatesBtn = document.getElementById('checkout-check-rates');
    var shippingStatus = document.getElementById('shipping-status');
    var shippingOptions = document.getElementById('shipping-options');
    var submitBtn = document.getElementById('checkout-submit');
    var submitLabel = submitBtn ? submitBtn.querySelector('.checkout-form__submit-label') : null;

    var summaryQuantity = document.getElementById('summary-quantity');
    var summarySubtotal = document.getElementById('summary-subtotal');
    var summaryShipping = document.getElementById('summary-shipping');
    var summaryShippingDiscountRow = document.getElementById('summary-shipping-discount-row');
    var summaryShippingDiscount = document.getElementById('summary-shipping-discount');
    var summaryTotal = document.getElementById('summary-total');
    var summaryDestination = document.getElementById('summary-destination');

    var state = {
      step: 1,
      rates: [],
      selectedRate: null,
      ratesStale: true,
      provincesLoaded: false,
      ratesRequestId: 0
    };
    var lastFocused = null;

    function setOptions(select, items, valueKeys, labelKeys, placeholder, postalKey) {
      if (!select) { return; }
      select.innerHTML = '';
      var placeholderOpt = document.createElement('option');
      placeholderOpt.value = '';
      placeholderOpt.textContent = placeholder;
      select.appendChild(placeholderOpt);

      var i;
      for (i = 0; i < (items || []).length; i++) {
        var item = items[i];
        var value = '';
        var label = '';
        var k;
        for (k = 0; k < valueKeys.length; k++) {
          if (item[valueKeys[k]] !== undefined && item[valueKeys[k]] !== null) {
            value = String(item[valueKeys[k]]);
            break;
          }
        }
        for (k = 0; k < labelKeys.length; k++) {
          if (item[labelKeys[k]] !== undefined && item[labelKeys[k]] !== null) {
            label = String(item[labelKeys[k]]);
            break;
          }
        }
        if (!value || !label) { continue; }
        var opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        opt.setAttribute('data-name', label);
        if (postalKey && item[postalKey]) {
          var postal = String(item[postalKey]);
          opt.setAttribute('data-postal-code', postal);
          opt.textContent = label + ' (' + postal + ')';
        }
        select.appendChild(opt);
      }
      select.disabled = false;
    }

    function resetSelect(select, placeholder) {
      if (!select) { return; }
      select.innerHTML = '';
      var opt = document.createElement('option');
      opt.value = '';
      opt.textContent = placeholder;
      select.appendChild(opt);
      select.disabled = true;
    }

    function invalidateRates() {
      state.rates = [];
      state.selectedRate = null;
      state.ratesStale = true;
      state.ratesRequestId++;
      if (next2Btn) { next2Btn.disabled = true; }
    }

    function selectedName(select) {
      if (!select || !select.options || select.selectedIndex < 0) { return ''; }
      var opt = select.options[select.selectedIndex];
      return opt.getAttribute('data-name') || opt.textContent || '';
    }

    function getSelectedPostalCode() {
      if (!subdistrictSelect || subdistrictSelect.selectedIndex < 0) { return ''; }
      var opt = subdistrictSelect.options[subdistrictSelect.selectedIndex];
      return opt.getAttribute('data-postal-code') || '';
    }

    async function loadProvinces() {
      if (state.provincesLoaded || !provinceSelect) { return; }
      provinceSelect.innerHTML = '<option value="">Memuat provinsi&hellip;</option>';
      provinceSelect.disabled = true;
      try {
        var data = await fetchJson(EVERPRO_CONFIG.provincesEndpoint);
        var excluded = EVERPRO_CONFIG.excludedProvinceNames || [];
        var list = (data.data || []).filter(function (item) {
          var name = item.province_name || item.name || '';
          return excluded.indexOf(name) === -1;
        });
        setOptions(provinceSelect, list, ['province_id', 'id'], ['province_name', 'name'], 'Pilih provinsi');
        state.provincesLoaded = true;
      } catch (err) {
        provinceSelect.innerHTML = '<option value="">Gagal memuat provinsi</option>';
        provinceSelect.disabled = false;
      }
    }

    async function loadCities(provinceId) {
      resetSelect(citySelect, 'Memuat kabupaten/kota&hellip;');
      resetSelect(districtSelect, 'Pilih kabupaten dulu');
      resetSelect(subdistrictSelect, 'Pilih kecamatan dulu');
      if (postalInput) { postalInput.value = ''; }
      invalidateRates();
      if (!provinceId) {
        resetSelect(citySelect, 'Pilih provinsi dulu');
        return;
      }
      citySelect.disabled = false;
      try {
        var data = await fetchJson(EVERPRO_CONFIG.citiesEndpoint + '?province_id=' + encodeURIComponent(provinceId));
        setOptions(citySelect, data.data || [], ['city_id'], ['city_name'], 'Pilih kabupaten/kota');
      } catch (err) {
        resetSelect(citySelect, 'Gagal memuat kabupaten/kota');
      }
    }

    async function loadDistricts(cityId) {
      resetSelect(districtSelect, 'Memuat kecamatan&hellip;');
      resetSelect(subdistrictSelect, 'Pilih kecamatan dulu');
      if (postalInput) { postalInput.value = ''; }
      invalidateRates();
      if (!cityId) {
        resetSelect(districtSelect, 'Pilih kabupaten dulu');
        return;
      }
      districtSelect.disabled = false;
      try {
        var data = await fetchJson(EVERPRO_CONFIG.districtsEndpoint + '?city_id=' + encodeURIComponent(cityId));
        setOptions(districtSelect, data.data || [], ['district_id'], ['district_name'], 'Pilih kecamatan');
      } catch (err) {
        resetSelect(districtSelect, 'Gagal memuat kecamatan');
      }
    }

    async function loadSubdistricts(districtId) {
      resetSelect(subdistrictSelect, 'Memuat kelurahan/desa&hellip;');
      if (postalInput) { postalInput.value = ''; }
      invalidateRates();
      if (!districtId) {
        resetSelect(subdistrictSelect, 'Pilih kecamatan dulu');
        return;
      }
      subdistrictSelect.disabled = false;
      try {
        var data = await fetchJson(EVERPRO_CONFIG.subdistrictsEndpoint + '?district_id=' + encodeURIComponent(districtId));
        setOptions(subdistrictSelect, data.data || [], ['sub_district_id'], ['sub_district_name'], 'Pilih kelurahan/desa', 'postal_code');
      } catch (err) {
        resetSelect(subdistrictSelect, 'Gagal memuat kelurahan/desa');
      }
    }

    function collectValues() {
      return {
        customer_name: nameInput ? nameInput.value.trim() : '',
        phone: phoneInput ? phoneInput.value.trim() : '',
        address: addressInput ? addressInput.value.trim() : '',
        quantity: qtyInput ? qtyInput.value : 1,
        province_id: provinceSelect ? provinceSelect.value : '',
        province_name: selectedName(provinceSelect),
        city_id: citySelect ? citySelect.value : '',
        city_name: selectedName(citySelect),
        district_id: districtSelect ? districtSelect.value : '',
        district_name: selectedName(districtSelect),
        sub_district_id: subdistrictSelect ? subdistrictSelect.value : '',
        sub_district_name: selectedName(subdistrictSelect),
        postal_code: postalInput ? postalInput.value : '',
        payment_method: paymentSelect ? paymentSelect.value : '',
        shipping_cost: state.selectedRate ? state.selectedRate.price : 0,
        shipping_discount: computeShippingDiscount(state.selectedRate ? state.selectedRate.price : 0),
        shipping_paid: computeShippingPaid(state.selectedRate ? state.selectedRate.price : 0),
        courier_code: state.selectedRate ? state.selectedRate.logistic_code : '',
        courier_name: state.selectedRate ? state.selectedRate.logistic_name : '',
        courier_service: state.selectedRate ? (state.selectedRate.rate_name || state.selectedRate.rate_code) : '',
        courier_etd: state.selectedRate ? formatShippingEta(state.selectedRate) : ''
      };
    }

    function validateAddress(values) {
      if (!values.customer_name) { alert('Mohon isi Nama Lengkap.'); return false; }
      if (!values.phone) { alert('Mohon isi Nomor HP / WhatsApp.'); return false; }
      if (!values.province_id) { alert('Mohon pilih Provinsi.'); return false; }
      if (!values.city_id) { alert('Mohon pilih Kabupaten / Kota.'); return false; }
      if (!values.district_id) { alert('Mohon pilih Kecamatan.'); return false; }
      if (!values.sub_district_id) { alert('Mohon pilih Kelurahan / Desa.'); return false; }
      if (!values.postal_code) { alert('Kode pos belum terisi. Pilih kelurahan/desa terlebih dahulu.'); return false; }
      if (!values.address) { alert('Mohon isi Alamat Lengkap.'); return false; }
      if (!(parseInt(values.quantity, 10) >= 1)) { alert('Jumlah botol minimal 1.'); return false; }
      return true;
    }

    function showStep(step) {
      state.step = step;
      var panels = form.querySelectorAll('[data-step]');
      var i;
      for (i = 0; i < panels.length; i++) {
        if (String(panels[i].getAttribute('data-step')) === String(step)) {
          panels[i].removeAttribute('hidden');
        } else {
          panels[i].setAttribute('hidden', '');
        }
      }
      var indicators = form.querySelectorAll('[data-step-indicator]');
      for (i = 0; i < indicators.length; i++) {
        var n = parseInt(indicators[i].getAttribute('data-step-indicator'), 10);
        indicators[i].classList.toggle('is-active', n === step);
        indicators[i].classList.toggle('is-done', n < step);
      }
      var dialog = form.closest('.checkout-modal__dialog');
      if (dialog && dialog.scrollTo) { dialog.scrollTo({ top: 0, behavior: 'smooth' }); }
    }

    function renderRates(rates) {
      if (!shippingOptions) { return; }
      shippingOptions.innerHTML = '';
      var i;
      for (i = 0; i < rates.length; i++) {
        (function (rate, index) {
          var label = document.createElement('label');
          label.className = 'shipping-option';
          label.setAttribute('data-rate-index', String(index));

          var radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'shipping_rate';
          radio.value = String(index);
          radio.addEventListener('change', function () {
            state.selectedRate = rate;
            var all = shippingOptions.querySelectorAll('.shipping-option');
            var j;
            for (j = 0; j < all.length; j++) {
              all[j].classList.remove('is-selected');
            }
            label.classList.add('is-selected');
            if (next2Btn) { next2Btn.disabled = false; }
          });

          var body = document.createElement('span');
          body.className = 'shipping-option__body';
          var name = document.createElement('span');
          name.className = 'shipping-option__name';
          name.textContent = (rate.logistic_name || rate.logistic_code || 'Kurir') +
            (rate.rate_name ? ' - ' + rate.rate_name : '');
          var meta = document.createElement('span');
          meta.className = 'shipping-option__meta';
          var eta = formatShippingEta(rate);
          meta.textContent = (eta ? 'Estimasi ' + eta : 'Estimasi menyusul') +
            (rate.weight ? ' • ' + rate.weight + ' gram' : '');
          body.appendChild(name);
          body.appendChild(meta);

          var price = document.createElement('span');
          price.className = 'shipping-option__price';
          price.textContent = formatRupiah(rate.price);

          label.appendChild(radio);
          label.appendChild(body);
          label.appendChild(price);
          shippingOptions.appendChild(label);
        })(rates[i], i);
      }
    }

    function updateSummary() {
      var values = collectValues();
      var qty = parseInt(values.quantity, 10) || 1;
      var subtotal = computeAmount(qty, CHECKOUT_CONFIG.unitPrice);
      var shippingCost = state.selectedRate ? state.selectedRate.price : 0;
      var discount = computeShippingDiscount(shippingCost);
      var shippingPaid = computeShippingPaid(shippingCost);
      if (summaryQuantity) { summaryQuantity.textContent = qty + ' botol'; }
      if (summarySubtotal) { summarySubtotal.textContent = formatRupiah(subtotal); }
      if (summaryShipping) {
        summaryShipping.textContent = state.selectedRate
          ? (state.selectedRate.logistic_name + ' - ' +
             (state.selectedRate.rate_name || state.selectedRate.rate_code) + ' (' +
             formatRupiah(shippingCost) + ')')
          : '-';
      }
      if (summaryShippingDiscountRow) {
        if (discount > 0) {
          summaryShippingDiscountRow.removeAttribute('hidden');
          if (summaryShippingDiscount) {
            summaryShippingDiscount.textContent = '-' + formatRupiah(discount);
          }
        } else {
          summaryShippingDiscountRow.setAttribute('hidden', '');
        }
      }
      if (summaryTotal) { summaryTotal.textContent = formatRupiah(subtotal + shippingPaid); }
      if (summaryDestination) { summaryDestination.textContent = buildDestinationLabel(values); }
    }

    async function loadRates() {
      var values = collectValues();
      if (!validateAddress(values)) { return; }

      state.rates = [];
      state.selectedRate = null;
      state.ratesStale = false;
      var requestId = ++state.ratesRequestId;
      if (next2Btn) { next2Btn.disabled = true; }
      if (shippingOptions) { shippingOptions.innerHTML = ''; }
      if (shippingStatus) { shippingStatus.textContent = 'Menghitung ongkir dari gudang TinyHoney... mohon tunggu.'; }
      if (checkRatesBtn) { checkRatesBtn.disabled = true; }

      try {
        var data = await fetchJson(EVERPRO_CONFIG.ratesEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildRatesPayload(values))
        });
        if (requestId !== state.ratesRequestId) { return; }
        var rates = flattenRates(data.data);
        state.rates = rates;
        renderRates(rates);
        if (!rates.length) {
          if (shippingStatus) {
            shippingStatus.textContent = 'Ongkir belum tersedia untuk alamat ini. Coba cek ulang atau hubungi admin via WhatsApp.';
          }
        } else if (shippingStatus) {
          shippingStatus.textContent = rates.length + ' pilihan kurir tersedia. Pilih salah satu.';
        }
      } catch (err) {
        if (requestId === state.ratesRequestId && shippingStatus) {
          shippingStatus.textContent = 'Gagal memuat ongkir: ' + (err.message || 'terjadi kesalahan') + '.';
        }
      } finally {
        if (requestId === state.ratesRequestId && checkRatesBtn) { checkRatesBtn.disabled = false; }
      }
    }

    function openModal() {
      lastFocused = document.activeElement;
      modal.removeAttribute('hidden');
      document.body.classList.add('checkout-open');
      showStep(1);
      updateSummary();
      loadProvinces();
      if (nameInput) { nameInput.focus(); }
    }

    function closeModal() {
      modal.setAttribute('hidden', '');
      document.body.classList.remove('checkout-open');
      if (lastFocused && typeof lastFocused.focus === 'function') { lastFocused.focus(); }
    }

    var i;
    var openers = document.querySelectorAll('.js-checkout-open');
    for (i = 0; i < openers.length; i++) {
      openers[i].addEventListener('click', openModal);
    }

    var closers = modal.querySelectorAll('[data-checkout-close], .js-checkout-close');
    for (i = 0; i < closers.length; i++) {
      closers[i].addEventListener('click', closeModal);
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hasAttribute('hidden')) {
        closeModal();
      }
    });

    if (provinceSelect) {
      provinceSelect.addEventListener('change', function () { loadCities(provinceSelect.value); });
    }
    if (citySelect) {
      citySelect.addEventListener('change', function () { loadDistricts(citySelect.value); });
    }
    if (districtSelect) {
      districtSelect.addEventListener('change', function () { loadSubdistricts(districtSelect.value); });
    }
    if (subdistrictSelect) {
      subdistrictSelect.addEventListener('change', function () {
        if (postalInput) { postalInput.value = getSelectedPostalCode(); }
        invalidateRates();
      });
    }
    if (qtyInput) {
      qtyInput.addEventListener('input', function () {
        invalidateRates();
        updateSummary();
      });
      qtyInput.addEventListener('change', updateSummary);
    }

    if (next1Btn) {
      next1Btn.addEventListener('click', function () {
        var values = collectValues();
        if (!validateAddress(values)) { return; }
        showStep(2);
        if (state.ratesStale || !state.rates.length) { loadRates(); }
      });
    }
    if (checkRatesBtn) { checkRatesBtn.addEventListener('click', loadRates); }
    if (back2Btn) { back2Btn.addEventListener('click', function () { showStep(1); }); }
    if (next2Btn) {
      next2Btn.addEventListener('click', function () {
        if (!state.selectedRate) {
          alert('Silakan pilih kurir terlebih dahulu.');
          return;
        }
        updateSummary();
        showStep(3);
      });
    }
    if (back3Btn) { back3Btn.addEventListener('click', function () { showStep(2); }); }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      if (state.step === 1) {
        var step1Values = collectValues();
        if (!validateAddress(step1Values)) { return; }
        showStep(2);
        if (state.ratesStale || !state.rates.length) { loadRates(); }
        return;
      }
      if (state.step === 2) {
        if (!state.selectedRate) { alert('Silakan pilih kurir terlebih dahulu.'); return; }
        updateSummary();
        showStep(3);
        return;
      }

      var values = collectValues();
      if (!validateAddress(values)) { return; }
      if (!state.selectedRate) { alert('Silakan pilih kurir terlebih dahulu.'); showStep(2); return; }
      if (!values.payment_method) { alert('Mohon pilih Metode Pembayaran.'); return; }

      function resetSubmit() {
        if (submitBtn) {
          submitBtn.disabled = false;
          if (submitLabel) { submitLabel.textContent = 'Bayar dengan Duitku'; }
        }
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        if (submitLabel) { submitLabel.textContent = 'Memproses...'; }
      }

      handleLpCheckout(values).then(resetSubmit, resetSubmit);
    });
  }

  // --- FAQ Accordion Module ---

  /**
   * Pure reducer for the FAQ accordion state.
   * State: { openIndex: number|null } — null means all panels collapsed.
   * Action: { type: 'TOGGLE', index: number }
   * If the clicked panel is already open, it closes (returns null).
   * If a different panel is clicked, it opens (single-open invariant).
   *
   * @param {{ openIndex: number|null }} state
   * @param {{ type: string, index: number }} action
   * @returns {{ openIndex: number|null }}
   */
  function accordionReducer(state, action) {
    if (action.type === 'TOGGLE') {
      return {
        openIndex: state.openIndex === action.index ? null : action.index
      };
    }
    return state;
  }

  /**
   * Returns whether the panel at the given index is open.
   * Pure function — no side effects.
   *
   * @param {{ openIndex: number|null }} state
   * @param {number} index
   * @returns {boolean}
   */
  function isPanelOpen(state, index) {
    return state.openIndex === index;
  }

  // Event delegation: click + keyboard handling on FAQ container
  // Side-effect: update aria-expanded, hidden attributes on DOM

  // --- Image Fallback Module ---
  function initImageFallback() {
    var imgs = document.querySelectorAll('img[data-fallback="card"]');
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].addEventListener('error', function () {
        this.style.display = 'none';
      });
    }
  }

  // --- Footer Module ---
  function initFooterYear() {
    var el = document.getElementById('current-year');
    if (el) {
      el.textContent = new Date().getFullYear();
    }
  }

  // --- Initialization ---
  if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {
    // 1. WhatsApp CTA wiring — all .js-whatsapp-cta elements
    var waUrl = buildWhatsAppUrl(WHATSAPP_CONFIG.phone, WHATSAPP_CONFIG.message);
    var ctaLinks = document.querySelectorAll('.js-whatsapp-cta');
    for (var i = 0; i < ctaLinks.length; i++) {
      ctaLinks[i].href = waUrl;
    }

    // 2. FAQ Accordion — event delegation on .faq__list container
    var accordionState = { openIndex: null };
    var faqList = document.querySelector('.faq__list');
    if (faqList) {
      faqList.addEventListener('click', function (e) {
        var trigger = e.target.closest('.faq-item__trigger');
        if (!trigger) return;

        // Find the index of this trigger among all triggers
        var triggers = faqList.querySelectorAll('.faq-item__trigger');
        var clickedIndex = -1;
        for (var j = 0; j < triggers.length; j++) {
          if (triggers[j] === trigger) { clickedIndex = j; break; }
        }
        if (clickedIndex === -1) return;

        // Compute new state via pure reducer
        accordionState = accordionReducer(accordionState, { type: 'TOGGLE', index: clickedIndex });

        // Apply new state to DOM
        for (var k = 0; k < triggers.length; k++) {
          var isOpen = isPanelOpen(accordionState, k);
          var panelId = triggers[k].getAttribute('aria-controls');
          var panel = document.getElementById(panelId);
          triggers[k].setAttribute('aria-expanded', isOpen ? 'true' : 'false');
          if (panel) {
            if (isOpen) {
              panel.removeAttribute('hidden');
            } else {
              panel.setAttribute('hidden', '');
            }
          }
        }
      });
    }

    // 3. Image fallback
    initImageFallback();

    // 4. Footer year
    initFooterYear();

    // 5. Checkout modal (Duitku payment flow)
    initCheckoutModal();

    // 6. Handle Duitku redirect/callback back to this landing page
    handleDuitkuRedirect();
  });
  }

  // Export for testability (Node.js/Jest environment)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildWhatsAppUrl: buildWhatsAppUrl,
      buildWhatsAppMessage: buildWhatsAppMessage,
      WHATSAPP_CONFIG: WHATSAPP_CONFIG,
      CHECKOUT_CONFIG: CHECKOUT_CONFIG,
      EVERPRO_CONFIG: EVERPRO_CONFIG,
      computeAmount: computeAmount,
      formatRupiah: formatRupiah,
      buildRatesPayload: buildRatesPayload,
      flattenRates: flattenRates,
      normalizeRatePrice: normalizeRatePrice,
      computeShippingDiscount: computeShippingDiscount,
      computeShippingPaid: computeShippingPaid,
      formatShippingEta: formatShippingEta,
      buildDestinationLabel: buildDestinationLabel,
      buildOrderPayload: buildOrderPayload,
      handleLpCheckout: handleLpCheckout,
      initCheckoutModal: initCheckoutModal,
      accordionReducer: accordionReducer,
      isPanelOpen: isPanelOpen,
      initImageFallback: initImageFallback,
      initFooterYear: initFooterYear,
      getReturnUrl: getReturnUrl,
      getPaymentMethodName: getPaymentMethodName,
      buildOrderWhatsAppMessage: buildOrderWhatsAppMessage,
      getStoredCheckout: getStoredCheckout,
      parseDuitkuRedirect: parseDuitkuRedirect,
      parseDuitkuCallback: parseDuitkuRedirect,
      parseDuitkuReturn: parseDuitkuRedirect,
      getDuitkuRedirectStatus: getDuitkuRedirectStatus,
      getDuitkuCallbackStatus: getDuitkuRedirectStatus,
      getDuitkuRedirectMessage: getDuitkuRedirectMessage,
      getDuitkuCallbackMessage: getDuitkuRedirectMessage,
      handleDuitkuRedirect: handleDuitkuRedirect,
      handleDuitkuCallback: handleDuitkuRedirect,
      handleDuitkuReturn: handleDuitkuRedirect
    };
  }
})();
