TRINI-D FRONTEND V43 — EXACT ADMIN PRICING PARITY

Fixes:
- Admin assets are cache-busted so the latest profile-publishing code actually loads.
- Smart Quote waits for Firebase pricing settings before estimating.
- A quote is blocked if the selected Admin material profile is missing or outdated.
- The exact profile (P, rho, diameter, power, electricity, printer cost/lifetime,
  failure risk, UPS cost/lifetime) and profit margin are sent to the backend.
- The browser verifies that the backend applied every value before showing a price.
- Expired temporary Cloudflare URLs are no longer hard-coded in smartquote-config.js.

Pricing contract:
  base = filament + electricity + machine depreciation + UPS depreciation
  total cost = base / (1 - failure risk)
  final price = total cost * (1 + profit margin / 100)
  all displayed rupee amounts use Math.ceil, matching Admin Calculator.
