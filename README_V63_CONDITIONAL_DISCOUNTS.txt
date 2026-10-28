TRINI-D WEBSITE v63 / DESKTOP v3.0.9 — Conditional PDF discounts
===============================================================
Applies to invoice and quotation PDFs on both platforms, including internal copies.

If item and overall discounts are both > 0:
  Item Discounts = per-item discount total
  Other Discounts = overall discount
  Total Discounts = sum of the two

If only item discounts > 0:
  Item Discounts = per-item discount total
  Total Discounts = per-item discount total

If only overall discount > 0:
  Other Discounts = overall discount
  Total Discounts = overall discount

If neither applies, none of those three rows/labels are displayed.
The item-discount table column is hidden where supported when it has no values.
The final total is only adjusted once: subtotal - item discounts - overall discount.

Website PDF implementation: admin/admin.js
Desktop PDF implementation: TriniD_Desktop_v3_0_9.py
No changes to the discount entry controls or document total calculations.
