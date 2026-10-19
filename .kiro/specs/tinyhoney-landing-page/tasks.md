# Implementation Plan: TinyHoney Landing Page

## Overview

The TinyHoney landing page is a zero-dependency static single-page site built with vanilla HTML, CSS, and JavaScript. The implementation follows the design document's file structure (`index.html`, `css/styles.css`, `js/main.js`) and builds incrementally: project scaffolding first, then the HTML document with all nine content sections, then the mobile-first CSS design system, then the JavaScript modules (WhatsApp URL builder, FAQ accordion reducer, image fallback, footer year, initialization), and finally tests — property-based, unit, integration, accessibility, and performance.

The two pure functions (`buildWhatsAppUrl` and `accordionReducer`) are implemented early and independently so their property-based tests can run alongside development. Each task builds on the previous one and ends with wiring everything together in the initialization module so no code is left orphaned.

## Tasks

- [ ] 1. Set up project structure and testing framework
  - [x] 1.1 Create directory structure and base files
    - Create `index.html` with minimal HTML5 skeleton (`<!DOCTYPE html>`, `<html lang="id">`, empty `<head>` and `<body>`)
    - Create `css/styles.css` (empty file with section comment headers matching the design's CSS organization)
    - Create `js/main.js` (empty file with IIFE wrapper and module comment headers matching the design's JS organization)
    - Create test directories: `tests/pbt/`, `tests/unit/`, `tests/integration/`
    - _Requirements: 19.2 (single CSS file), 19.3 (single JS file)_

  - [x] 1.2 Set up package.json and test dependencies
    - Create `package.json` with project metadata, `"type": "commonjs"` (for Node test runner compatibility), and `devDependencies`: `fast-check`, `jest`, `jsdom`, `@playwright/test`, `@axe-core/playwright`, `lighthouse`
    - Add npm scripts: `test:pbt`, `test:unit`, `test:integration`, `test:a11y`, `test:perf`, `test` (runs pbt + unit)
    - Create `jest.config.js` with jsdom test environment and `testMatch` patterns for `tests/unit/**` and `tests/pbt/**`
    - Create `playwright.config.js` with base URL `http://localhost:3000`, projects for chromium, and a webServer config to serve static files
    - Pin exact versions for all dependencies
    - _Requirements: 19.2, 19.3 (test infrastructure)_

- [x] 2. Build HTML document structure and SEO metadata
  - [x] 2.1 Build document head and page skeleton
    - Add `<meta charset="UTF-8">` and viewport meta tag to `<head>`
    - Add `<title>` tag: "TinyHoney — Pencernaan Sehat, Makan Lahap, Imunitas Kuat" (55 chars, ≤ 60 max)
    - Add meta description (≤ 160 chars) referencing digestive health, appetite, immunity
    - Add Open Graph tags: `og:title`, `og:description`, `og:image` (referencing `assets/images/banner-desktop.png`), `og:type`
    - Add favicon link to `assets/logo/icon.png`
    - Add single CSS link: `<link rel="stylesheet" href="css/styles.css">`
    - Add `<header class="site-header">` with logo image (`assets/logo/logo.webp`, WebP, `width`/`height` attributes, `alt="TinyHoney"`) and brand name span
    - Add `<main>` container landmark
    - Add `<script defer src="js/main.js"></script>` before `</body>`
    - _Requirements: 3.3, 16.3, 17.4, 18.1, 18.2, 18.3, 19.2, 19.3_

  - [x] 2.2 Build hero, pain points, and root cause sections
    - Hero section: badge text, `h1` headline, sub-headline (containing "madu murni", "jahe merah", "daun pepaya", "prebiotik alami"), WhatsApp CTA link (class `js-whatsapp-cta`, `data-cta-context="hero"`), sub-CTA note, `<picture>` element with desktop source (`min-width: 768px`) and mobile `<img>` fallback (`loading="eager"`, `width`/`height`, descriptive `alt`)
    - Pain points section: `h2` title, 4 problem cards in order (Sering Kembung & Rewel, Drama Susah Makan (GTM), Daya Tahan Tubuh Rentan, Bingung Memilih Suplemen) each with image from `assets/images/problem/`, `h3` title, and 15–50 word description paragraph
    - Root cause section: `h2` headline, body paragraph (digestion → discomfort → GTM + low immunity → Tinyhoney solution), product image (`product-podium.png`, `loading="lazy"`, `width`/`height`, `alt`)
    - _Requirements: 2.1–2.6, 3.1–3.4, 4.1–4.5, 5.1–5.3, 16.1, 16.2, 17.1_

  - [x] 2.3 Build ingredients, taste, and cara konsumsi sections
    - Ingredients section: `h2` headline, 7 ingredient cards in order (Madu Murni, Jahe Merah, Daun Pepaya, Habbatussauda, Temulawak, Kunyit, Ekstrak Apel) each with image from `assets/images/komposisi/`, `h3` name, benefit paragraph matching exact text from design, all with `loading="lazy"` and `width`/`height`
    - Taste section: `h2` headline, 3 taste features (Manis & Segar Alami, Tekstur Lembut, Fleksibel & Mudah Dikonsumsi) each with decorative emoji icon (`aria-hidden="true"`), `h3` title, descriptive sentence
    - Cara konsumsi section: `h2` headline, 3 usage points in order (Waktu Terbaik, Takaran Sederhana, Usia Konsumsi) each with decorative icon, `h3` title, description matching design content
    - _Requirements: 6.1–6.6, 7.1–7.2, 8.1–8.4, 16.1, 16.2, 17.1, 17.2_

  - [x] 2.4 Build social proof, promo placeholder, FAQ, final CTA, sticky button, and footer
    - Social proof section: `h2` headline, 2 cert groups (BPOM with `logo-bpom.png` + claim text, Halal with `logo-halal.png` + claim text), product image (`produk-halal-bpom.png`), `h3` testimoni title, 6 testimoni images (`3.png`–`8.png` from `assets/images/testimoni/`) all with `loading="lazy"`, `width`/`height`, `alt`
    - Promo section: empty `<section id="promo" hidden>` with empty `aria-label` (placeholder, no content)
    - FAQ section: `h2` headline, 5 FAQ items each with `h3` heading containing a `<button>` trigger (`aria-expanded="false"`, `aria-controls`, `id`) and a panel `div` (`role="region"`, `aria-labelledby`, `hidden`) with answer text matching design content
    - Final CTA section: `h2` headline, sub-headline paragraph, WhatsApp CTA link (class `js-whatsapp-cta`, `data-cta-context="final-cta"`)
    - Sticky WhatsApp button: `<a>` with class `js-whatsapp-cta`, `data-cta-context="sticky"`, `target="_blank"`, `rel="noopener noreferrer"`, `aria-label`, containing `icon-small.webp` (`alt=""`, `aria-hidden="true"`) and label span
    - Footer: logo + brand name, BPOM & Halal cert claims, copyright with `<span id="current-year">2025</span>`, WhatsApp contact link (class `js-whatsapp-cta`, `data-cta-context="footer"`)
    - _Requirements: 1.1, 1.2, 1.3, 9.1–9.6, 10.1, 10.4–10.5, 11.1–11.3, 13.1–13.4, 14.1–14.3, 16.1, 16.2, 17.1, 17.2, 17.4, 20.1–20.4_

  - [ ]* 2.5 Write unit tests for HTML content and DOM structure
    - Test section order in DOM matches specification (Hero → Pain Points → Root Cause → Ingredients → Taste → Cara Konsumsi → Social Proof → Promo → FAQ → Final CTA)
    - Test hero content: badge text, headline text, sub-headline phrases, CTA label, sub-CTA note
    - Test pain points: title, 4 cards, order, image sources
    - Test ingredients: headline, 7 cards, order, image sources, benefit text
    - Test taste and cara konsumsi: headlines, 3 feature/usage points with descriptions
    - Test social proof: headline, cert claims, logo images, product image, 6 testimoni images
    - Test FAQ: 5 items, all collapsed by default, question order, answer content
    - Test promo: empty section with `hidden` attribute between social proof and FAQ
    - Test footer: logo, cert claims, copyright year span, contact link
    - Test images: all have `width`/`height` attributes, lazy loading where below fold, eager on hero
    - Test accessibility: alt text ≤ 125 chars on content images, `alt=""` on decorative images, semantic landmarks, heading hierarchy
    - Test SEO: title tag ≤ 60 chars, meta description ≤ 160 chars, OG tags present
    - Run with jsdom via Jest
    - _Requirements: 1.1–1.2, 2.1–2.5, 4.1–4.4, 6.1–6.5, 7.1–7.2, 8.1–8.4, 9.1–9.6, 10.1, 10.4–10.5, 11.1–11.3, 14.1–14.2, 16.1–16.4, 17.1–17.4, 18.1–18.3, 20.1–20.4_

- [x] 3. Implement CSS design system and responsive layout
  - [x] 3.1 Create design tokens and base/reset styles
    - Add CSS custom properties (`:root`) for colors, typography, spacing scale, breakpoints, layout values matching the design's token table exactly
    - Add base reset: `box-sizing: border-box`, margin/padding reset, `font-size: 16px` minimum on body, line-height 1.6, body color and background
    - Add heading styles: `h1` (2rem), `h2` (1.5rem), `h3` (1.25rem) — no skipped levels
    - Add focus indicator base style: `--color-focus` outline with 3:1+ contrast
    - Add image base: `max-width: 100%`, `height: auto` to prevent overflow
    - _Requirements: 15.4, 17.3_

  - [x] 3.2 Implement layout utilities, responsive grid, and all component styles
    - Add container utility (`.container`, max-width 1200px, centered)
    - Add grid utilities for card layouts (`.pain-points__grid`, `.ingredients__grid`, `.taste__features`, `.cara-konsumsi__points`, `.testimoni-grid`)
    - Mobile-first base: all grids single-column by default
    - Tablet breakpoint (`@media (min-width: 768px)`): multi-column grids (2 cols), hero `<picture>` desktop source activates
    - Desktop breakpoint (`@media (min-width: 1024px)`): 3–4 column grids, content images `min-width: 400px`, root cause two-column layout
    - Component styles: hero, pain-points, root-cause, ingredients, taste, cara-konsumsi, social-proof, promo (no styles needed — hidden), faq, final-cta, footer, sticky-wa-button
    - Sticky WhatsApp button: `position: fixed`, `bottom: 16px`, `right: 16px`, `z-index: 1000` (all viewports)
    - Button styles: `.btn--whatsapp` with `--color-whatsapp` background, hover/focus states
    - FAQ accordion panel transition/hidden styles
    - _Requirements: 1.3, 3.1–3.2, 5.3, 9.5, 13.1–13.4, 15.1–15.4, 17.3_

  - [ ]* 3.3 Write responsive layout tests
    - Test mobile layout (320px viewport): single-column stacks, no horizontal scroll, 16px min body font, sticky button visible
    - Test tablet layout (768px viewport): multi-column grids (2 cols), sticky button visible
    - Test desktop layout (1024px viewport): multi-column grids (3–4 cols), content images ≥ 400px, desktop hero banner active
    - Test sticky button: `position: fixed`, `bottom: 16px`, `right: 16px`, visible during scroll
    - Test focus indicators: visible, 3:1 contrast on interactive elements
    - Test cert logos and product image visible in same viewport (desktop)
    - Run with Playwright
    - _Requirements: 1.3, 3.1–3.2, 9.5, 13.1–13.4, 15.1–15.4, 17.3_

- [x] 4. Implement JavaScript: WhatsApp URL builder
  - [x] 4.1 Implement buildWhatsAppUrl and buildWhatsAppMessage pure functions
    - In `js/main.js`, add `buildWhatsAppUrl(phone, message)` function: strips non-digit characters from phone, URL-encodes message via `encodeURIComponent`, returns `https://wa.me/{digits}?text={encoded}`
    - Add `buildWhatsAppMessage()` function: returns pre-filled message referencing TinyHoney product, consultation, and order
    - Add `WHATSAPP_CONFIG` constant with `phone` and `message` fields
    - Export both functions and config (use `module.exports` for testability, guard with `typeof module !== 'undefined'`)
    - Do NOT wire to DOM yet (done in initialization task 6.1)
    - _Requirements: 12.1, 12.2_

  - [ ]* 4.2 Write property test: WhatsApp URL encoding round-trip
    - **Property 3: WhatsApp URL encoding round-trip**
    - For any message string, extracting the `text` query parameter from `buildWhatsAppUrl(phone, message)` and URL-decoding it yields the original message
    - Use fast-check with `fc.string({ maxLength: 500 })`, minimum 100 iterations
    - Tag: `Feature: tinyhoney-landing-page, Property 3: WhatsApp URL encoding round-trip`
    - **Validates: Requirements 12.2**

  - [ ]* 4.3 Write property test: WhatsApp URL format and phone sanitization
    - **Property 4: WhatsApp URL format and phone sanitization**
    - For any phone string (including non-digit characters) and any message, the URL matches `https://wa.me/{digits}?text={encoded}` where phone portion contains only digits
    - Use fast-check with `fc.string({ maxLength: 20 })` for phone and `fc.string({ maxLength: 500 })` for message, minimum 100 iterations
    - Tag: `Feature: tinyhoney-landing-page, Property 4: WhatsApp URL format and phone sanitization`
    - **Validates: Requirements 12.1, 12.2**

  - [ ]* 4.4 Write unit tests for WhatsApp URL builder
    - Test known inputs: phone "6281234567890" produces correct wa.me URL
    - Test phone with non-digit characters ("+62 812-345-67890") strips to digits
    - Test message with special characters (spaces, ampersands, emoji) encodes correctly
    - Test empty message produces URL with empty text param
    - Test `buildWhatsAppMessage()` returns non-empty string referencing product, consultation, and order
    - Run with Jest
    - _Requirements: 12.1, 12.2_

- [x] 5. Implement JavaScript: FAQ accordion reducer
  - [x] 5.1 Implement accordionReducer and isPanelOpen pure functions
    - In `js/main.js`, add `accordionReducer(state, action)` where state is `{ openIndex: number | null }` and action is `{ type: 'TOGGLE', index: number }`; returns `{ openIndex: state.openIndex === action.index ? null : action.index }`
    - Add `isPanelOpen(state, index)` returning `state.openIndex === index`
    - Export both functions (guard with `typeof module !== 'undefined'`)
    - Do NOT wire to DOM yet (done in initialization task 6.1)
    - _Requirements: 10.1, 10.2, 10.3, 10.6, 17.5_

  - [ ]* 5.2 Write property test: Accordion toggle round-trip
    - **Property 1: Accordion toggle round-trip**
    - For any accordion state and any item index `i`, applying `TOGGLE(i)` twice produces the original state
    - Use fast-check with `fc.record({ openIndex: fc.oneof(fc.null(), fc.nat(4)) })` and `fc.nat(4)`, minimum 100 iterations
    - Tag: `Feature: tinyhoney-landing-page, Property 1: Accordion toggle round-trip`
    - **Validates: Requirements 10.2, 10.3**

  - [ ]* 5.3 Write property test: Accordion single-open invariant
    - **Property 2: Accordion single-open invariant**
    - For any state and toggle on item `i`, the resulting state has at most one panel open; if a different panel `j` was open it is now closed
    - Use fast-check with same generators, minimum 100 iterations
    - Tag: `Feature: tinyhoney-landing-page, Property 2: Accordion single-open invariant`
    - **Validates: Requirements 10.6**

  - [ ]* 5.4 Write property test: Accordion ARIA state indication
    - **Property 5: Accordion ARIA state indication**
    - For any state and index `i`, `isPanelOpen(state, i)` equals whether `i` is the open panel, ensuring `aria-expanded` attributes correctly reflect state
    - Use fast-check with same generators, minimum 100 iterations
    - Tag: `Feature: tinyhoney-landing-page, Property 5: Accordion ARIA state indication`
    - **Validates: Requirements 17.5**

  - [ ]* 5.5 Write unit tests for accordion reducer
    - Test initial state `{ openIndex: null }` with toggle(0) → `{ openIndex: 0 }`
    - Test toggle same index twice returns to original
    - Test toggle different index closes previous, opens new
    - Test `isPanelOpen` returns correct boolean for open and closed panels
    - Test toggle on null state with index 4 → `{ openIndex: 4 }`
    - Run with Jest
    - _Requirements: 10.1, 10.2, 10.3, 10.6, 17.5_

- [x] 6. Implement JavaScript: supporting modules and initialization
  - [x] 6.1 Implement image fallback, footer year, and initialization wiring
    - Image fallback module: query all `img[data-fallback="card"]` elements, add `error` event listener that sets `this.style.display = 'none'` to hide broken images while keeping card text visible
    - Footer year module: set `document.getElementById('current-year').textContent = new Date().getFullYear()`
    - Initialization on DOMContentLoaded:
      - Query all `.js-whatsapp-cta` elements and set `href` to `buildWhatsAppUrl(WHATSAPP_CONFIG.phone, WHATSAPP_CONFIG.message)`
      - Attach accordion event delegation on `.faq__list` container: on click of `.faq-item__trigger`, compute new state via `accordionReducer`, update `aria-expanded` and `hidden` attributes on the corresponding trigger and panel (single-open behavior)
      - Keyboard support for accordion: Enter/Space activation handled natively by `<button>` elements; verify `aria-expanded` updates correctly
    - This task wires all previously implemented functions to the DOM — no orphaned code remains
    - _Requirements: 3.4, 4.5, 6.6, 10.2, 10.3, 10.6, 12.1, 12.2, 12.3, 16.4, 17.5, 20.3_

  - [ ]* 6.2 Write unit tests for image fallback and footer modules
    - Test image fallback: simulate error event on an `img[data-fallback="card"]`, verify `display: none` is set
    - Test footer year: verify `current-year` text content is set to current year
    - Test WhatsApp CTA wiring: verify all `.js-whatsapp-cta` elements have `href` containing `wa.me` after initialization
    - Test accordion DOM wiring: simulate click on trigger, verify `aria-expanded` toggles and panel `hidden` attribute updates
    - Test accordion single-open: open one panel, click another, verify first collapses
    - Run with jsdom via Jest
    - _Requirements: 3.4, 4.5, 6.6, 10.2, 10.3, 10.6, 12.1–12.3, 16.4, 17.5, 20.3_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Integration, accessibility, and performance testing
  - [ ]* 8.1 Write integration tests for interactive behavior
    - Test WhatsApp CTA click: verify `href` contains `wa.me` URL with pre-filled message, opens in new tab (`target="_blank"`)
    - Test FAQ accordion: click collapsed question expands answer, click again collapses, opening second closes first (single-open)
    - Test FAQ keyboard: Enter and Space keys activate accordion toggle, `aria-expanded` updates
    - Test sticky button: fixed position, visible during scroll, not in document flow, opens WhatsApp in new tab
    - Test promo section: hidden when empty, displays content when `hidden` attribute removed (simulated)
    - Run with Playwright
    - _Requirements: 1.3, 2.6, 10.2, 10.3, 10.6, 11.4, 13.1–13.4, 14.1–14.3, 17.5_

  - [ ]* 8.2 Write accessibility tests
    - Run axe-core automated checks: alt text presence and length, ARIA roles and states, heading hierarchy, landmark elements
    - Test focus indicators: visible focus outlines with 3:1 contrast on WhatsApp CTA buttons and FAQ triggers
    - Test semantic HTML: `header`, `main`, `section`, `footer` landmarks present, no skipped heading levels
    - Test decorative images: `alt=""` on emoji icons and sticky button icon
    - Run with @axe-core/playwright integrated with Playwright
    - _Requirements: 17.1–17.5_

  - [ ]* 8.3 Write performance tests
    - Test LCP: hero section content renders within 2.5s of navigation start
    - Test full page load: completes within 5s
    - Test render-blocking resources: no more than 1 CSS request, JS deferred
    - Run Lighthouse audit via CLI or playwright-lighthouse with mobile preset and simulated 4G connection
    - _Requirements: 19.1, 19.2, 19.3, 19.4_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties of the two pure functions (`buildWhatsAppUrl` and `accordionReducer`)
- Unit tests validate specific examples, DOM structure, and edge cases
- Integration tests validate interactive behavior via headless browser (Playwright)
- Accessibility tests use axe-core for automated WCAG checks
- Performance tests use Lighthouse with mobile/4G simulation
- The implementation language is vanilla HTML, CSS, and JavaScript (no frameworks, no build tools)
- Task 6.1 wires all previously implemented pure functions to the DOM, ensuring no orphaned code

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "5.1", "4.2"] },
    { "id": 3, "tasks": ["2.3", "4.3", "4.4", "5.2"] },
    { "id": 4, "tasks": ["2.4", "3.3", "5.3", "5.5", "6.1"] },
    { "id": 5, "tasks": ["2.5", "5.4", "6.2", "8.1", "8.2", "8.3"] }
  ]
}
```
