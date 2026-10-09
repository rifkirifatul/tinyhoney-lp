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
  });

  // Export for testability (Node.js/Jest environment)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildWhatsAppUrl: buildWhatsAppUrl,
      buildWhatsAppMessage: buildWhatsAppMessage,
      WHATSAPP_CONFIG: WHATSAPP_CONFIG,
      accordionReducer: accordionReducer,
      isPanelOpen: isPanelOpen,
      initImageFallback: initImageFallback,
      initFooterYear: initFooterYear
    };
  }
})();
