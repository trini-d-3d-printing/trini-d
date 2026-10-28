TRINI-D WEBSITE V66 — Protected invoice bank account number

SETUP
1. Open Admin > Invoice Generator > Bank Details.
2. Click Set 4-Digit PIN and enter/confirm a PIN.
3. Use Unlock Account and enter the PIN before editing the account number.
4. Save Bank Details. Check the full account number before confirming the change.
5. The account number locks automatically after 90 seconds or saving.
6. Use Change PIN to update the PIN (requires current PIN).

PIN SECURITY
- The 4-digit PIN is never stored as plaintext. A random-salted PBKDF2-SHA-256 verifier is stored in browser localStorage.
- Five wrong attempts trigger a five-minute lockout, stored across page reloads.
- The PIN verifier is device/browser-specific; configure a PIN separately for the desktop program and for each website browser.
- This is accidental/casual misuse protection. Anyone with admin access, browser developer tools, local files, or direct database permissions can bypass client-side controls. For stronger security enforce server-side rules and require reauthentication for bank-account changes.
- Keep a secure backup of the account number. There is no PIN recovery or reset button without knowing the previous PIN.
- Bank account number is still printed in full on invoices when the checkbox is enabled.
