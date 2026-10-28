TriniD Website v59 — Optional discount % (Quotation + Invoice editors)
=======================================================================
Each line's Discount cell now has a small "%" box beside the Rs amount.
  - Type the Rs discount as before (default), OR type a % and the Rs amount is
    calculated: qty x unit price x % (rounded up to whole rupees, max 100%).
  - Changing qty or unit price re-calculates while a % is set.
  - Typing the Rs amount yourself clears the % (manual amount wins).
  - "Set All" row has the same pair: Discount (Rs) | %.
Works the same in Quotation and Invoice (Bill) editors; PDFs and totals are
unchanged because they still read the Rs amount.
Files changed: admin/admin.js, admin/admin.css, admin/index.html (cache version).
The % itself is not stored in saved records/drafts; the calculated Rs amount is.
Matches desktop software v3.0.5.
