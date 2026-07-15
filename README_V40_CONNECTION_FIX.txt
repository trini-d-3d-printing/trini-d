TRINI-D SMART QUOTE V40 CONNECTION FIX

Fixed:
- Added the missing setConfiguredApiUrl() function.
- Firebase can now update the public backend URL correctly.
- A blank/stale Firebase value no longer removes the bundled public URL.
- GitHub Pages no longer attempts localhost URLs and therefore no longer hides the real public-backend error.
- Added /health verification and clear timeout/error messages.
- A fresh FormData body is created for every API attempt.
- Added cache-busting versions to smartquote-config.js and smartquote.js.
- Updated all customer-facing messages from "local backend" to "Smart Quote backend".

Deployment:
Upload/replace the complete contents of this folder in the GitHub Pages branch.
Keep the backend and Cloudflare tunnel running.
When Cloudflare creates a different quick-tunnel URL, save it in Admin > Export / Settings.
