TRINI-D WEBSITE v65 / DESKTOP v3.0.11 — SAVED INVOICE BANK DETAILS
==================================================================

New in the Invoice / Bill Generator ONLY (quotation generator unchanged):
 - Checkbox: Include saved bank details in this invoice PDF (OFF by default).
 - Editable Bank Name, Account Holder, Account Number, Branch,
   optional SWIFT / BIC and optional Payment Reference / Instructions.
 - Save Bank Details for Future Invoices button keeps the profile across sessions.
 - PDFs include the BANK DETAILS section only if checkbox is ticked and
   required Bank Name, Account Holder, Account Number are populated.
 - Current form values are used for the PDF. Changes can be saved using the button.
 - Invoice totals, advance balances and discount logic are unchanged.

WEBSITE
 - Bank profile is stored as database.bankDetails in the existing admin database
   (browser local database and authenticated Firebase/Firestore cloud sync).
 - Invoice drafts retain the checkbox preference. A reset unticks it but does
   not erase the saved bank profile.
 - Saved invoice records snapshot the bank fields used for that specific PDF,
   so reprinting a past invoice does not silently substitute a later bank profile.
 - Loading a saved invoice for editing also restores the bank profile used in it.
 - Never put banking data in the public website pages or public Smart Quote config.

DESKTOP
 - Bank profile is stored in %APPDATA%/Trini_D_3D_Printing/invoice_bank_details.json
   on Windows (the software's standard APPDATA folder; local user profile on
   other platforms). This is not stored inside the packaged .py source.
 - Both customer and internal invoice copies include the bank section if opted in.
 - Cloud upload of the desktop database preserves the website bank profile if
   the desktop has no local saved profile. If a desktop profile exists, it is
   used on explicit Sync to Cloud. Download from Cloud also imports bank details.
 - Your existing printer/database records and PDF save-folder settings remain intact.

PRIVACY
 Bank account details are confidential business information. The website saves
 them in the authenticated admin database/cloud; verify Firebase access rules
 before sharing access. The desktop JSON profile is kept in the local user
 settings directory, not in customer-facing website pages.

USER FLOW
 1. Open Invoice / Bill Generator.
 2. Type the bank details and click Save Bank Details for Future Invoices.
 3. Tick Include saved bank details in this invoice PDF when desired.
 4. Generate the invoice PDF. Leave unticked to omit all bank details.
 5. Edit fields and click Save again any time the company's bank details change.

Existing v64 conditional discount display behavior remains unchanged.
