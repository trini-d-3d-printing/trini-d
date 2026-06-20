Trini-D Website + Admin Panel Setup
===================================

What is included
----------------
1. Public website files remain in the main folder:
   - index.html
   - about.html
   - services.html
   - gallery.html
   - quotation.html
   - contact.html
   - styles.css
   - script.js
   - assets/

2. Admin dashboard is inside:
   - admin/index.html
   - admin/admin.css
   - admin/admin.js

Admin features added
--------------------
- Price Calculator using the same pricing logic from the desktop app.
- Save calculator results to Item Details database.
- Add calculated item to Bill or Quotation.
- Generate quotation print/PDF page.
- Generate invoice/bill print/PDF page.
- Orders database.
- Quotation database.
- Item Details database.
- Budget records.
- Sync orders into budget income/expense.
- Custom groups/tables for selected Item Details records.
- Export CSV for active table.
- Export/import full JSON backup.

Important security note
-----------------------
The admin page includes a simple PIN screen for convenience only.
Default PIN: 1234
Change it in admin/admin.js before publishing:

  const ADMIN_PIN = '1234';

For real admin-only protection, use your hosting provider's password protection, cPanel Directory Privacy, Cloudflare Access, or server-side login.
Do not rely only on the JavaScript PIN for a public website.

How to deploy as a subdomain
----------------------------
Option A: Main domain + admin folder
- Upload all files to your main hosting public_html folder.
- Admin will open at: yourdomain.com/admin/

Option B: Real admin subdomain
- Create a subdomain in hosting/cPanel, for example admin.yourdomain.com.
- Set the document root of that subdomain to the admin folder.
- Copy the assets folder or keep the same relative structure so admin can load ../assets/logo.jpg.
- Enable password protection on the subdomain folder.

Data storage note
-----------------
This version is frontend-only and stores admin data in the browser localStorage.
That means data is saved on the same computer/browser you use.
Use Export JSON regularly for backup.
For multiple admins using a shared cloud database, a backend with authentication and database hosting is required later.

LATEST ADMIN PANEL CHANGES
--------------------------
- Dashboard now shows only: Total Items, Total Orders, Total Profit, and Budget Balance.
- Item Details database now has Order and Bill action buttons.
- Selected item records can be added to Orders or sent to the Bill form.
- Calculator Add to Item Details has duplicate protection for the same calculated result.
- Quotation numbers use timestamp format: QT-YYYYMMDD-HHMMSS.
- Invoice numbers use timestamp format: INV-YYYYMMDD-HHMMSS.
- Quotation and invoice print pages now use the attached Trini-D PDF theme: black header/footer, gold totals, QR code, and A4 layout.
- Desktop SQLite database import is available in Export / Settings.

DESKTOP DATABASE IMPORT
-----------------------
Use Export / Settings > Import Desktop SQLite DB for the desktop SQLite database.
Offline fallback instructions are in README_DESKTOP_IMPORT.txt.
