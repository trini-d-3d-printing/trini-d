TRINI-D FRONTEND V44 — QUOTATION/INVOICE SET ALL + SUPPORT COLUMN REMOVED

Changes (admin/index.html, admin/admin.js, admin/admin.css):

- Removed the "Support" column entirely from the line-item records list in
  both the Quotation tab and the Bills / Invoices tab (table header + each
  row). Underlying support data is still defaulted internally so nothing
  else (PDF exports, calculator hand-off) breaks, but it's no longer shown
  or editable in the admin item list.

- Added a "Set All" row above the item rows in both the Quotation and
  Invoice tables. It has live controls for Material, Color, Qty, Layer,
  Walls, and Infill — picking/typing a value there instantly applies it to
  that column across every current row in the list, then recalculates
  totals and re-saves the draft. Model, Unit Price, Discount, Cost,
  Weight, and Print Time are not settable in bulk.

Not changed in this version (flagged for confirmation, not requested):
- Internal Quotation PDF still has a Support column.
- Customer-facing PDF spec line still lists Support when present.
- Database order-detail view still lists Support when present.
