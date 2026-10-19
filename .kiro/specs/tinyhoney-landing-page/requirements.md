# Requirements Document

## Introduction

This specification defines the requirements for the TinyHoney landing page, a static single-page website (HTML/CSS/JS) that markets a children's honey supplement product to Indonesian mothers ("Bunda"). The landing page presents the product's value proposition through nine content sections — from a hero introduction through pain points, root-cause education, ingredients, taste profile, usage instructions, social proof, FAQ, and a final call-to-action — all designed to drive conversions via WhatsApp consultation and ordering.

The page targets mobile-first visitors, must render responsively across desktop, tablet, and mobile devices, and integrates a floating WhatsApp button for persistent access to the ordering channel. Content is written in Indonesian (Bahasa Indonesia).

## Glossary

- **Landing_Page**: The complete static single-page web application (HTML/CSS/JS) that serves as the TinyHoney marketing page.
- **TinyHoney**: The children's honey supplement product being marketed, combining madu murni (pure honey) with six herbal extracts.
- **Bunda**: Indonesian term of address for "mother"; the primary target audience of the landing page.
- **Visitor**: Any person viewing the Landing_Page in a web browser, including Bunda (potential customer).
- **Hero_Section**: The topmost section of the Landing_Page containing the badge, headline, sub-headline, CTA button, sub-CTA note, and banner imagery.
- **Pain_Points_Section**: The section presenting four common problems experienced by Bunda and her child (kembung, GTM, low immunity, supplement confusion).
- **Root_Cause_Section**: The section explaining that 70% of the immune system and appetite originate from healthy digestion.
- **Ingredients_Section**: The section displaying seven natural ingredients (madu, jahe merah, daun pepaya, habbatussauda, temulawak, kunyit, ekstrak apel) and their benefits.
- **Taste_Section**: The section describing the taste and texture profile of TinyHoney to address child rejection concerns.
- **Cara_Konsumsi_Section**: The section providing daily usage instructions (timing, dosage, age recommendation).
- **Social_Proof_Section**: The section displaying BPOM certification, Halal certification, and customer testimonials.
- **FAQ_Section**: The section presenting five frequently asked questions in an interactive accordion format.
- **Final_CTA_Section**: The closing section with a headline, sub-headline, and WhatsApp ordering button.
- **Promo_Section**: A reserved placeholder area positioned before the FAQ_Section for future promotional or pricing content.
- **WhatsApp_CTA**: Any call-to-action button that links to WhatsApp with a pre-filled consultation/ordering message.
- **Sticky_WhatsApp_Button**: A persistent floating button anchored to the bottom-right corner of the viewport on mobile devices.
- **BPOM**: Badan Pengawas Obat dan Makanan, the Indonesian regulatory agency for food and drugs; product certification.
- **Halal**: Islamic dietary certification confirming product permissibility and hygiene.
- **GTM**: Gerakan Tolak Makan, Indonesian term for a child's pattern of refusing to eat (picky eating).
- **Prebiotik**: Prebiotic substances that nourish beneficial gut microbiota to support digestive health.
- **Accordion**: An interactive UI component that expands and collapses FAQ answer panels when the corresponding question is clicked.
- **Breakpoint**: A defined viewport width at which the layout adjusts via responsive CSS (e.g., 768px for tablet, 1024px for desktop).
- **WebP**: A modern image format used for the TinyHoney logo assets to optimize page weight.

## Requirements

### Requirement 1: Page Structure and Section Ordering

**User Story:** As a Bunda, I want the landing page to present information in a logical flow from problem awareness to solution to action, so that I can understand the product value and make a purchase decision.

#### Acceptance Criteria

1. THE Landing_Page SHALL render nine content sections in the following top-to-bottom order in both document structure and visual layout on all viewport widths: Hero_Section, Pain_Points_Section, Root_Cause_Section, Ingredients_Section, Taste_Section, Cara_Konsumsi_Section, Social_Proof_Section, FAQ_Section, Final_CTA_Section.
2. THE Landing_Page SHALL insert the Promo_Section placeholder between the Social_Proof_Section and the FAQ_Section, occupying the position without displaying promotional content and without altering the relative order of adjacent sections.
3. THE Landing_Page SHALL render the Sticky_WhatsApp_Button as a persistent overlay that does not occupy document flow space and remains visible at all vertical scroll positions across all viewport widths.

### Requirement 2: Hero Section Content

**User Story:** As a Bunda, I want to immediately understand what TinyHoney is and why I should consider it, so that I decide to keep reading the page.

#### Acceptance Criteria

1. THE Hero_Section SHALL display a badge with the text "100% Madu Murni & Ekstrak Alami | Terdaftar BPOM & Bersertifikat Halal".
2. THE Hero_Section SHALL display the headline "Pencernaan Sehat, Makan Lahap, Imunitas Kuat."
3. THE Hero_Section SHALL display a sub-headline containing the phrases "madu murni", "jahe merah", "daun pepaya", and "prebiotik alami", and conveying the benefits of improving digestion, maintaining immunity, and restoring the child's appetite.
4. THE Hero_Section SHALL display a WhatsApp_CTA button with the label "Konsultasi & Order via WhatsApp Sekarang".
5. THE Hero_Section SHALL display a sub-CTA note with the text "Cocok & aman dikonsumsi untuk anak usia 1 tahun ke atas".
6. WHEN the Bunda clicks the WhatsApp_CTA button, THE Hero_Section SHALL open WhatsApp to start a conversation for consultation and ordering.

### Requirement 3: Hero Section Imagery

**User Story:** As a Bunda, I want to see a clear visual of the product and brand, so that I feel confident about the product's authenticity.

#### Acceptance Criteria

1. WHILE the viewport width is 768 pixels or wider, THE Hero_Section SHALL display the banner-desktop.png image.
2. WHILE the viewport width is less than 768 pixels, THE Hero_Section SHALL display the banner-mobile.png image instead of the banner-desktop.png image.
3. THE Hero_Section SHALL include the TinyHoney logo (logo.webp) from the assets/logo/ directory in the page header.
4. IF the banner image fails to load, THEN THE Hero_Section SHALL display a text description of the banner content in place of the image.

### Requirement 4: Pain Points Section Content

**User Story:** As a Bunda, I want to see that the product creators understand the problems my child and I face, so that I feel heard and trust the solution presented.

#### Acceptance Criteria

1. THE Pain_Points_Section SHALL display the title "Bunda & Si Kecil Mengalami Masalah Ini?".
2. THE Pain_Points_Section SHALL display four problem cards, each containing an image, a title, and a descriptive paragraph of 15 to 50 words.
3. THE Pain_Points_Section SHALL present the four problems in the following order: "Sering Kembung & Rewel", "Drama Susah Makan (GTM)", "Daya Tahan Tubuh Rentan", "Bingung Memilih Suplemen".
4. THE Pain_Points_Section SHALL render the corresponding image from assets/images/problem/ for each problem card (kembung-dan-rewel.jpg, anak-susah-makan.png, anak-sakit.png, ibu-bingung.png).
5. IF a problem card image fails to load, THEN THE Pain_Points_Section SHALL display the card with its title and descriptive paragraph without the image.

### Requirement 5: Root Cause and Solution Section Content

**User Story:** As a Bunda, I want to understand why my child has these problems and how TinyHoney addresses the root cause, so that I trust the product's approach.

#### Acceptance Criteria

1. THE Root_Cause_Section SHALL display the headline "Tahukah Bunda? 70% Sistem Imun dan Nafsu Makan Berawal dari Pencernaan yang Sehat!".
2. THE Root_Cause_Section SHALL display a body paragraph conveying the following information points: disrupted digestion causes discomfort in the child, this discomfort leads to GTM (child refusing to eat) and low immunity, and Tinyhoney combines madu murni with six herbal extracts to address digestion at its root.
3. THE Root_Cause_Section SHALL display the product image (product-podium.png or product-only.png) within the same content section as the headline and body paragraph, positioned next to the text content.

### Requirement 6: Ingredients and Benefits Section Content

**User Story:** As a Bunda, I want to know exactly what ingredients are in TinyHoney and what each one does, so that I can verify the product is natural and safe for my child.

#### Acceptance Criteria

1. THE Ingredients_Section SHALL display the headline "Satu Sendok Tinyhoney, Manfaatnya Banyak Banget".
2. THE Ingredients_Section SHALL display seven ingredient cards, each containing an image, an ingredient name, and a benefit description.
3. THE Ingredients_Section SHALL present the seven ingredients in the following order: Madu Murni, Jahe Merah, Daun Pepaya, Habbatussauda, Temulawak, Kunyit, Ekstrak Apel.
4. THE Ingredients_Section SHALL render each ingredient card with its corresponding image from assets/images/komposisi/: Madu Murni with madu.png, Jahe Merah with jahe-merah.png, Daun Pepaya with daun-pepaya.png, Habbatussauda with habbatussauda.png, Temulawak with temulawak.png, Kunyit with kunyit.png, Ekstrak Apel with apel.png.
5. THE Ingredients_Section SHALL display the following benefit description text for each ingredient:
   - Madu Murni: "Memberikan karbohidrat sederhana sebagai sumber energi harian si kecil serta kaya senyawa bioaktif/antioksidan alami."
   - Jahe Merah: "Kandungan prebiotiknya membantu mendukung kenyamanan dan kesehatan pencernaan anak."
   - Daun Pepaya: "Membantu pemenuhan prebiotik alami untuk mendukung mikrobioma dan pencernaan anak."
   - Habbatussauda: "Membantu meredakan keluhan begah, kembung, dan rasa tidak nyaman di perut anak."
   - Temulawak: "Membantu merangsang proses pencernaan dan mendukung nafsu makan anak secara alami."
   - Kunyit: "Membantu merangsang proses pencernaan dan sekresi empedu, sehingga mendukung proses pencernaan anak."
   - Ekstrak Apel: "Mengandung serat larut (pektin) yang membantu menjaga kelancaran proses pencernaan agar anak lebih nyaman saat BAB."
6. IF an ingredient card image fails to load, THEN the ingredient name and benefit description SHALL still display without the image, and remaining ingredient cards SHALL render without interruption.

### Requirement 7: Taste and Texture Section Content

**User Story:** As a Bunda, I want reassurance that my child will not reject the taste of TinyHoney, so that I am confident the product will be consumed willingly.

#### Acceptance Criteria

1. THE Taste_Section SHALL display the headline "Rasa Enak yang Pasti Disukai Si Kecil!".
2. THE Taste_Section SHALL display three feature points labeled "Manis & Segar Alami", "Tekstur Lembut", and "Fleksibel & Mudah Dikonsumsi".
3. THE Taste_Section SHALL display a descriptive sentence associated with each feature point: the sentence for "Manis & Segar Alami" shall state that the taste is naturally sweet and fresh with no fishy odor; the sentence for "Tekstur Lembut" shall state that the texture is slightly thick but liquid in the mouth without fibers or throat sticking; the sentence for "Fleksibel & Mudah Dikonsumsi" shall state that it is consumable directly from a spoon or mixed into water, warm milk, or healthy snacks.

### Requirement 8: Cara Konsumsi Section Content

**User Story:** As a Bunda, I want clear instructions on how and when to give TinyHoney to my child, so that I use the product correctly and safely.

#### Acceptance Criteria

1. THE Cara_Konsumsi_Section SHALL display the headline "Panduan Aturan Pakai Harian Tinyhoney".
2. THE Cara_Konsumsi_Section SHALL display three usage points labeled "Waktu Terbaik", "Takaran Sederhana", and "Usia Konsumsi".
3. THE Cara_Konsumsi_Section SHALL present the three usage points in the following order: "Waktu Terbaik", "Takaran Sederhana", "Usia Konsumsi".
4. THE Cara_Konsumsi_Section SHALL display a description for each usage point matching the following content: "Waktu Terbaik" — morning and evening after meals; "Takaran Sederhana" — 1 tablespoon per consumption; "Usia Konsumsi" — safe and recommended for children aged 1 year and above.

### Requirement 9: Social Proof and Credibility Section Content

**User Story:** As a Bunda, I want evidence that TinyHoney is legally certified and trusted by other mothers, so that I feel confident in its safety and quality.

#### Acceptance Criteria

1. THE Social_Proof_Section SHALL display the headline "Ketenangan Hati Bunda Adalah Prioritas Utama Kami".
2. THE Social_Proof_Section SHALL display the BPOM certification claim stating the product is clinically tested and registered with Badan Pengawas Obat dan Makanan.
3. THE Social_Proof_Section SHALL display the Halal certification claim stating halal guarantee and hygiene in every drop.
4. THE Social_Proof_Section SHALL display the logo-bpom.png image adjacent to and within the same visual grouping as the BPOM certification claim, and the logo-halal.png image adjacent to and within the same visual grouping as the Halal certification claim.
5. THE Social_Proof_Section SHALL display the product image (produk-halal-bpom.png) with the BPOM and Halal logos visible within the same viewport area as the product image without requiring the user to scroll or zoom.
6. THE Social_Proof_Section SHALL display all 6 customer review images from assets/images/testimoni/ (3.png through 8.png), with each image visible to the user.

### Requirement 10: FAQ Section Content and Interaction

**User Story:** As a Bunda, I want answers to common questions before I commit to purchasing, so that I can overcome my remaining doubts and place an order.

#### Acceptance Criteria

1. THE FAQ_Section SHALL display five question-and-answer pairs in an Accordion format with all panels in a collapsed state by default.
2. WHEN a Visitor clicks a collapsed question in the FAQ_Section, THE Accordion SHALL expand to reveal the corresponding answer.
3. WHEN a Visitor clicks an already-expanded question, THE Accordion SHALL collapse to hide the corresponding answer.
4. THE FAQ_Section SHALL present the following five questions in order: (1) Is the product BPOM-registered and Halal-certified? (2) Is the honey pure? (3) Can it help children who refuse to eat? (4) What is the minimum safe age? (5) What if the child is a picky eater?
5. THE FAQ_Section SHALL display answers that contain the following key information for each corresponding question: (1) BPOM and Halal registration numbers visible on packaging; (2) pure honey combined with six natural extracts; (3) ingredients stimulating appetite naturally by improving digestion first; (4) safe for children 1 year and above; (5) natural sweet taste without fishy odor, mixable into milk or juice.
6. WHILE another question is expanded, WHEN a Visitor clicks a collapsed question, THE Accordion SHALL collapse the previously expanded question.

### Requirement 11: Final CTA Section Content

**User Story:** As a Bunda, I want a final compelling prompt to take action, so that I complete the consultation and order process.

#### Acceptance Criteria

1. THE Final_CTA_Section SHALL display the headline "Kembalikan Kebahagiaan Si Kecil Mulai Hari Ini!".
2. THE Final_CTA_Section SHALL display a sub-headline that states the child's natural prebiotik needs should be met with Tinyhoney, states that Tinyhoney protects the child's digestive tract, and states that support is available for Bunda's questions.
3. THE Final_CTA_Section SHALL display a WhatsApp_CTA button with the label "Pesan Tinyhoney & Konsultasi via WhatsApp".
4. WHEN the Bunda clicks the WhatsApp_CTA button, THE System SHALL open a WhatsApp conversation for ordering Tinyhoney and for consultation.

### Requirement 12: WhatsApp CTA Integration

**User Story:** As a Bunda, I want to contact the seller easily through WhatsApp, so that I can ask questions and place an order without friction.

#### Acceptance Criteria

1. WHEN a Visitor clicks any WhatsApp_CTA button, THE Landing_Page SHALL open a WhatsApp conversation link containing a pre-filled message that references the product promoted on the Landing_Page and includes both a consultation question prompt and an order placement request.
2. THE Landing_Page SHALL construct the WhatsApp link using the wa.me URL format with the seller's registered WhatsApp phone number in international format and a URL-encoded pre-filled message.
3. THE Landing_Page SHALL apply the WhatsApp_CTA behavior to all CTA buttons across the Hero_Section and Final_CTA_Section.

### Requirement 13: Sticky WhatsApp Button

**User Story:** As a Bunda browsing on my phone, I want a persistent way to contact the seller at any point while reading, so that I do not have to scroll back to find the order button.

#### Acceptance Criteria

1. WHILE the viewport width is below the tablet breakpoint, THE Sticky_WhatsApp_Button SHALL remain fixed at 16 pixels from the bottom edge and 16 pixels from the right edge of the viewport.
2. WHILE the Visitor scrolls through any section of the Landing_Page, THE Sticky_WhatsApp_Button SHALL remain visible and not obscured by other page content.
3. WHEN a Visitor clicks the Sticky_WhatsApp_Button, THE Landing_Page SHALL open the same WhatsApp conversation link as defined in Requirement 12 in a new browser tab while retaining the current page state.
4. WHILE the viewport width is at or above the tablet breakpoint, THE Sticky_WhatsApp_Button SHALL remain visible and fixed at 16 pixels from the bottom edge and 16 pixels from the right edge of the viewport.

### Requirement 14: Promo Section Placeholder

**User Story:** As a product marketer, I want a reserved space for promotional or pricing content, so that I can add future offers without restructuring the page.

#### Acceptance Criteria

1. THE Landing_Page SHALL render the Promo_Section as a semantic HTML section element containing no child content elements, positioned in document order between the Social_Proof_Section and the FAQ_Section.
2. WHILE no content elements are present in the Promo_Section, THE Promo_Section SHALL not be visible and occupies no space in the page layout.
3. WHEN one or more content elements are inserted into the Promo_Section, THE Landing_Page SHALL display that content in document order between the Social_Proof_Section and the FAQ_Section without altering the relative document-order positions of the Social_Proof_Section and the FAQ_Section.

### Requirement 15: Responsive Design

**User Story:** As a Bunda, I want the landing page to display correctly on my phone, tablet, and computer, so that I can read and interact with the content on any device.

#### Acceptance Criteria

1. WHILE the viewport width is below 768px, THE Landing_Page SHALL apply the mobile layout with single-column content stacks, images scaled to fit within the viewport width without overflow, and the Sticky_WhatsApp_Button visible.
2. WHILE the viewport width is between 768px and 1023px inclusive, THE Landing_Page SHALL apply the tablet layout with multi-column grids for content sections containing more than one content item of the same type.
3. WHILE the viewport width is 1024px or greater, THE Landing_Page SHALL apply the desktop layout with multi-column grids, content images displayed at a minimum width of 400 pixels, and the desktop hero banner.
4. WHILE the viewport width is 320px or greater, THE Landing_Page SHALL render all text content at a minimum body text font size of 16 pixels without horizontal scrolling.

### Requirement 16: Image Rendering and Optimization

**User Story:** As a Bunda with a mobile data connection, I want images to load efficiently, so that the page loads quickly and does not consume excessive data.

#### Acceptance Criteria

1. THE Landing_Page SHALL render all image elements with width and height attributes set to each image's intrinsic dimensions to prevent layout shift during loading.
2. THE Landing_Page SHALL apply lazy loading to images below the bottom edge of the viewport on first page render to defer their loading.
3. THE Landing_Page SHALL render the TinyHoney logo in WebP format from assets/logo/.
4. IF an image asset fails to load, THEN THE Landing_Page SHALL display non-empty alternative text for the failed image.

### Requirement 17: Accessibility

**User Story:** As a Bunda using assistive technology, I want the landing page to be navigable and understandable, so that I can access the content regardless of ability.

#### Acceptance Criteria

1. THE Landing_Page SHALL provide alt text of 125 characters or fewer for all content images that convey meaningful information, including product images, ingredient images, problem scenario images, testimonial images, and certification badge images.
2. THE Landing_Page SHALL mark all decorative images that serve purely aesthetic purposes and do not convey information necessary to understand page content with an empty alt attribute (alt="").
3. WHEN a Visitor navigates using a keyboard, THE Landing_Page SHALL provide visible focus indicators with a minimum 3:1 contrast ratio against adjacent colors on all interactive elements including WhatsApp_CTA buttons and FAQ Accordion triggers.
4. THE Landing_Page SHALL use semantic HTML5 landmark elements (header, main, section, footer) to define the document structure and use logical heading hierarchy (h1 through h6) without skipping heading levels.
5. WHEN a Visitor activates a FAQ Accordion trigger using the Enter or Space key, THE Accordion SHALL expand or collapse the corresponding answer panel and indicate the current state to assistive technology.

### Requirement 18: SEO and Metadata

**User Story:** As a potential customer searching online, I want the TinyHoney landing page to appear in search results, so that I can discover the product.

#### Acceptance Criteria

1. THE Landing_Page SHALL include a title tag in the document head containing the product name "TinyHoney" and at least one of the key benefit terms: digestive health, appetite, or immunity, with a maximum length of 60 characters.
2. THE Landing_Page SHALL include a meta description tag in the document head containing references to the product's key benefits (digestive health, appetite, immunity), with a maximum length of 160 characters.
3. THE Landing_Page SHALL include Open Graph meta tags in the document head for title, description, and image, where the og:image tag references a resolvable image.

### Requirement 19: Page Performance

**User Story:** As a Bunda, I want the landing page to load quickly, so that I do not abandon the page before seeing the content.

#### Acceptance Criteria

1. THE Landing_Page SHALL render the Hero_Section content (text and above-the-fold hero image) within 2.5 seconds of page navigation start, where "above-the-fold" means visible within the initial browser viewport without scrolling, and before rendering any other page section content.
2. THE Landing_Page SHALL load all CSS required for initial render from a single minified stylesheet with no more than 1 render-blocking CSS request.
3. THE Landing_Page SHALL load JavaScript in a non-blocking manner (deferred or placed before the closing body tag) to prevent render-blocking.
4. THE Landing_Page SHALL complete full page load within 5 seconds of page navigation start.

### Requirement 20: Page Footer

**User Story:** As a Bunda, I want to see brand information and any legal or contact details at the bottom of the page, so that I can verify the seller's legitimacy.

#### Acceptance Criteria

1. THE Landing_Page SHALL render a footer as the bottommost section of the page, positioned after the Final_CTA_Section, that contains the TinyHoney logo and brand name.
2. THE Landing_Page SHALL display the BPOM and Halal certification claims in the footer without requiring user interaction to reveal them.
3. THE Landing_Page SHALL display a copyright notice with the current year and the TinyHoney brand name in the footer.
4. THE Landing_Page SHALL display at least one contact method for TinyHoney in the footer, such as a WhatsApp_CTA link, phone number, or email address.
