TRINI-D DESKTOP DATABASE IMPORT
===============================

Your desktop software stores the main database as SQLite:

  trini_d_print_database.sqlite3

Usually on Windows it is here:

  C:\Users\<YourName>\AppData\Roaming\Trini_D_3D_Printing\trini_d_print_database.sqlite3

BEST METHOD IN THE ADMIN WEBSITE
--------------------------------
1. Open the admin panel.
2. Go to Export / Settings.
3. Click Import Desktop SQLite DB.
4. Select the exported desktop database file.

This imports:
- Item Details / calculator records
- Orders
- Budget records
- Custom groups and custom records

Duplicate protection:
Imported desktop rows use stable IDs like DESKTOP-ITEM-1 and DESKTOP-ORDER-1, so importing the same desktop DB again updates the same rows instead of duplicating them.

IMPORTANT NOTE
--------------
Direct SQLite import in the browser uses sql.js from a CDN. So your browser needs internet access at least once for that reader to load.

OFFLINE FALLBACK METHOD
-----------------------
Use the included converter script:

  tools/convert_desktop_db_to_admin_json.py

Example:

  python tools/convert_desktop_db_to_admin_json.py trini_d_print_database.sqlite3 TriniD_Admin_Import.json

Then open admin panel > Export / Settings > Import JSON Backup and choose:

  TriniD_Admin_Import.json

