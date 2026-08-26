TriniD Website v46 — Edit Past Quotations & Invoices
======================================================

What's new
----------
1. Database tab -> Bills / Invoices and Database tab -> Quotations now have an
   "Edit" button on every row.

   Clicking it loads that record's full editable line-item list (Model,
   Material, Color, Qty, Unit Price, Discount/Cost for invoices, Layer,
   Walls, Infill, Weight, Print Time) plus the header fields (Customer,
   Date, Notes, Paid Status/Method for invoices, the Design/Other Service
   name and price) straight back into the Bill/Invoice or Quotation editor
   form, and switches you to that tab.

   From there you can change any value (e.g. bump Infill from 15% to 20%,
   fix a Unit Price, add a discount) and press "Generate" again as normal.
   This re-saves it as a new record and re-opens the customer/internal PDF
   with your changes - it does not overwrite the old saved record.

2. Only the last 50 quotations and last 50 invoices are now kept.

   Every time a new quotation or invoice is generated, the oldest record
   beyond 50 is dropped from that list. This is a rolling window, not an
   archive - nothing beyond the most recent 50 of each type is kept.

   IMPORTANT: if you already have more than 50 saved quotations or
   invoices in your cloud database, the very next time you generate a new
   one of that type, the oldest records beyond the most recent 50 will be
   trimmed away permanently. Export a JSON backup first (Export/Settings
   tab) if you want to keep a full history beyond 50.

   This only stores the editable items list and header fields for re-use
   in the admin panel - it does not store generated PDF files.

Scope
-----
Only admin/admin.js was changed:
  - saveQuotationRecord() / generateInvoice(): cap db.quotes / db.invoices
    to the most recent 50 entries after each save.
  - New loadItemsIntoEditor(), loadInvoiceIntoEditor(), loadQuoteIntoEditor()
    functions.
  - New "Edit" button + click handler wired into the existing Bills/Invoices
    and Quotations record tables.
No other feature, styling, or calculation was touched.
