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
    notes: 'Pesanan via LP Tiny Honey'
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
    lines.push('- Total: ' + formatRupiah(amount));
    lines.push('- Metode Pembayaran: ' + getPaymentMethodName(details.payment_method));
    if (details.order_number) { lines.push('- No. Order: ' + details.order_number); }
    if (details.reference) { lines.push('- Kode Referensi Duitku: ' + details.reference); }
    lines.push('');
    lines.push('Detail Pembeli:');
    lines.push('- Nama: ' + (details.customer_name || '-'));
    lines.push('- No. HP: ' + (details.phone || '-'));
    lines.push('- Alamat: ' + (details.address || '-'));
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
    return {
      product_name: CHECKOUT_CONFIG.productName,
      amount: computeAmount(values.quantity, CHECKOUT_CONFIG.unitPrice),
      quantity: parseInt(values.quantity, 10) || 1,
      customer_name: values.customer_name,
      phone: values.phone,
      address: values.address,
      payment_method: values.payment_method,
      landing_page_source: CHECKOUT_CONFIG.landingPageSource,
      notes: CHECKOUT_CONFIG.notes,
      return_url: getReturnUrl(),
      returnUrl: getReturnUrl()
    };
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
            window.sessionStorage.setItem('tinyhoney_checkout', JSON.stringify({
              customer_name: values.customer_name,
              phone: values.phone,
              address: values.address,
              quantity: parseInt(values.quantity, 10) || 1,
              payment_method: values.payment_method,
              amount: computeAmount(values.quantity, CHECKOUT_CONFIG.unitPrice),
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
        amount: stored ? stored.amount : computeAmount(stored ? stored.quantity : 1, CHECKOUT_CONFIG.unitPrice),
        product_name: CHECKOUT_CONFIG.productName,
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
    var totalEl = document.getElementById('checkout-total');
    var submitBtn = document.getElementById('checkout-submit');
    var submitLabel = submitBtn ? submitBtn.querySelector('.checkout-form__submit-label') : null;
    var lastFocused = null;

    function updateTotal() {
      if (!totalEl) { return; }
      var qty = qtyInput ? qtyInput.value : 1;
      totalEl.textContent = formatRupiah(computeAmount(qty, CHECKOUT_CONFIG.unitPrice));
    }

    function openModal() {
      lastFocused = document.activeElement;
      modal.removeAttribute('hidden');
      document.body.classList.add('checkout-open');
      updateTotal();
      var first = document.getElementById('lp-name');
      if (first) { first.focus(); }
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

    if (qtyInput) {
      qtyInput.addEventListener('input', updateTotal);
      qtyInput.addEventListener('change', updateTotal);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var nameEl = document.getElementById('lp-name');
      var phoneEl = document.getElementById('lp-phone');
      var addressEl = document.getElementById('lp-address');
      var paymentEl = document.getElementById('lp-payment');

      var values = {
        customer_name: nameEl ? nameEl.value.trim() : '',
        phone: phoneEl ? phoneEl.value.trim() : '',
        address: addressEl ? addressEl.value.trim() : '',
        quantity: qtyInput ? qtyInput.value : 1,
        payment_method: paymentEl ? paymentEl.value : ''
      };

      if (!values.customer_name || !values.phone ||
          !values.address || !values.payment_method) {
        alert('Mohon lengkapi Nama, Nomor HP, Alamat, dan Metode Pembayaran.');
        return;
      }

      function resetSubmit() {
        if (submitBtn) {
          submitBtn.disabled = false;
          if (submitLabel) { submitLabel.textContent = 'Beli Sekarang'; }
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

  // Export for testability (Node.js/Jest environment)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildWhatsAppUrl: buildWhatsAppUrl,
      buildWhatsAppMessage: buildWhatsAppMessage,
      WHATSAPP_CONFIG: WHATSAPP_CONFIG,
      CHECKOUT_CONFIG: CHECKOUT_CONFIG,
      computeAmount: computeAmount,
      formatRupiah: formatRupiah,
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
