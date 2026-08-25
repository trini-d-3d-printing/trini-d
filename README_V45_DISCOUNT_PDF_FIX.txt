TriniD Website v45 — Invoice PDF Discount Column Overlap Fix
==============================================================

Bug
---
When an invoice line item had a discount applied, the generated invoice PDF
showed the "Discount" and "Total" column values overlapping each other in
both the header row and the data row.

Root cause
----------
In admin/admin.js, the print-invoice CSS for the discount layout positioned
the Discount and Total columns at almost the same horizontal offset:

  .i-discount-disc  { left:430pt; width:60pt }   (header)
  .i-total-disc     { right:4pt;  width:62pt }   (header)   -> spans ~427-489pt
  .id-discount-disc { left:418pt; width:72pt }   (data)
  .id-total-disc    { right:4pt;  width:72pt }   (data)     -> spans ~417-489pt

Both columns landed in nearly the same ~60-70pt band on the right edge of
the table, so their text rendered on top of each other. The header and data
rows also used different offsets from each other, so even where they didn't
overlap they wouldn't have lined up correctly.

Fix
---
Repositioned all 5 columns (Model, Qty, Unit Price, Discount, Total) with
clean, non-overlapping spacing, and made the header (.i-*-disc) and data
(.id-*-disc) rows share the exact same left/width values so labels and
values line up vertically:

  Model:    left:4pt   width:190pt
  Qty:      left:206pt width:35pt
  Unit:     left:253pt width:70pt
  Discount: left:335pt width:70pt
  Total:    right:4pt  width:76pt

Scope
-----
Only this CSS (inside the printInvoiceHtml/printDocument template string in
admin/admin.js) was changed. No other function, styling, or feature was
touched — verified with a full diff against the v44 source.
