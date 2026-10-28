TRINI-D WEBSITE v64 / DESKTOP v3.0.10 — PDF discount display rules
==============================================================
Applies to invoice and quotation PDF summaries (customer and internal copies).

Case 1: Both item and overall discounts are nonzero
  Item Discounts: sum of item discounts
  Other Discounts: overall discount
  Total Discounts: sum of item discounts and overall discount

Case 2: Item discounts only
  Total Discounts: sum of item discounts

Case 3: Overall discount only
  Total Discounts: overall discount

Case 4: Neither discount
  Display no discount summary rows

Total Discounts is an informational combined discount total, not a second deduction.
The final amount remains subtotal minus item discounts minus overall discount.
No changes to input controls, amounts, or other features.

Website PDF logic: admin/admin.js
Desktop PDF logic: TriniD_Desktop_v3_0_10.py
