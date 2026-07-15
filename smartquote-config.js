// Stage 2 API configuration for local real-slicer backend.
// Keep your backend running with: python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

window.TRINID_QUOTE_API_URL = "http://127.0.0.1:8000";

// Later, when you deploy the backend online, replace it with your HTTPS API URL, for example:
// window.TRINID_QUOTE_API_URL = "https://api.yourdomain.com";
