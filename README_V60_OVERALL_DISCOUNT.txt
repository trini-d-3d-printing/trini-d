TRINI-D WEBSITE v60 / DESKTOP v3.0.6 — Overall bill discount
=================================================================
New optional OVERALL DISCOUNT at the end of the calculation, in both:
- Website Admin: Invoice/Bill and Quotation editors
- Desktop software: Invoice/Bill and Quotation tabs

The existing per-item Rs and percentage discount controls are preserved.
The new optional overall discount can be entered either as Rs or as %.
Entering a percentage calculates the equivalent Rs discount (rounded UP to
whole rupees), and entering a manual Rs discount clears the optional %.
The discount is calculated AFTER the per-item discounts and service charges,
and cannot reduce the bill total below Rs 0. Advance payments are subtracted
after the overall discount.

Customer invoice and quotation PDFs on both platforms now show separate
"Item Discounts" and "Overall Discount" lines (when applicable) before
TOTAL / TOTAL QUOTE. Matching amounts and final totals are used.
Desktop internal invoice/quotation PDFs and website internal quotation PDFs
also account for the overall discount when computing profit and customer total.

The website saves the discount with its draft and saved document, and restores
it when editing a saved invoice or quotation.

A calculation example:
  Subtotal including services               Rs 1,200
  Item discounts                             Rs   100
  Amount before overall discount            Rs 1,100
  Overall discount of 10% (or Rs 110)       Rs   110
  FINAL TOTAL                                Rs   990

Website release: v60 (upgrade from trini-d-main-v59.zip)
Desktop release: v3.0.6 (upgrade from TriniD_Desktop_v3_0_5.py)

The website still prints to PDF via the browser's Print / Save as PDF flow;
the desktop uses ReportLab. Both share the same totals and discount breakdown,
although browser PDF rendering and ReportLab are separate PDF engines.

Files updated:
  admin/index.html, admin/admin.js, admin/admin.css
  README_V60_OVERALL_DISCOUNT.txt
Full website site files, assets and other features are retained in the ZIP.
