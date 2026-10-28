TriniD Website v58 — New logos + desktop-identical quotation PDF
=================================================================

1. Logos / brand images (assets/)
   Replaced with the supplied "website logos" set: logo.png, logo.jpg,
   brand_name.png, pdf-brand.png. Every page, the admin panel and all
   generated PDFs reference these files, so they pick up the new artwork.
   Image links carry ?v=58 so browsers do not show the old cached logos.
   assets/whatsapp-qr.png was regenerated with the same settings the desktop
   app uses (the old file had stray text baked into its bottom edge, which
   showed up in the PDF footer).

2. Quotation PDF (admin/admin.js -> printDocument)
   The customer quotation now uses the desktop software's exact layout:
   header, customer panel, table columns (centred between the desktop column
   edges), "919.00" unit-price format, left-aligned bold model name, spec
   line "Material | Color | Weight | Time", Subtotal / Total Discount /
   TOTAL QUOTE block, notes, footer, page line, "QUOTATION CONT." pages and
   page-break rule. Verified by rendering the desktop generate_pdf() and the
   website PDF with the same data and overlaying them.
   Invoice PDFs are untouched (verified identical to v57 output).

3. Quotation discount summary (same as the Invoice section)
   The quotation editor already had a Discount column + Set All. What the
   invoice section had and the quotation did not was the running
   Subtotal / Discount / Total summary. Website: added a "Subtotal" box to
   the Quotation summary (admin/index.html, admin/admin.js recalcQuote).
   Desktop (TriniD_Desktop_v3_0_4.py, supplied separately): the Quotation tab
   now has a per-line Total column and a Subtotal / Discount / TOTAL QUOTE
   summary, updated live, like the Bill tab.
