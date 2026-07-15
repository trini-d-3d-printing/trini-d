Trini-D Website v32 - Localhost Smart Quote + Quote/Bill Service Options

New in this version:
1. Smart Quote connects to localhost real-slicer backend at http://127.0.0.1:8000/api/quote.
2. Admin quotation and bill/invoice item tables use material and color dropdowns.
   - Materials: PLA+, PETG+
   - Colors: Black, White, Gray, Red, Blue, Green, Yellow, Orange, Gold, Silver, Transparent, Natural
3. Quotation and bill sections include an optional Design / Other Service charge.
4. Customer PDF option: show/hide weight and printing time.
   - This setting is remembered in the browser until changed.
5. Optional filename setting: add customer name to quotation/invoice PDF filename.
   - This setting is remembered in the browser until changed.

Localhost backend usage:
- Keep the FastAPI backend running:
  python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
- Keep PrusaSlicer path configured in the backend .env.
- Open smartquote.html from this website.

Important:
- Localhost API works only on your own computer while the backend CMD window is running.
- For customers to use Smart Quote online, the backend must be hosted on a public HTTPS server later.
