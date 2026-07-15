// Trini-D Smart Quote API configuration.
// Use the Cloudflare URL only (no /health and no /api/quote at the end).
window.TRINID_QUOTE_API_URL =
  "https://psychiatry-picture-appearance-sailing.trycloudflare.com";

// Local addresses are used only when this page itself is opened locally.
// On GitHub Pages, smartquote.js automatically ignores these HTTP addresses.
window.TRINID_QUOTE_API_URLS = [
  window.TRINID_QUOTE_API_URL,
  "http://127.0.0.1:8000",
  "http://localhost:8000"
];
