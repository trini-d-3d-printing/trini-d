Trini-D Website v67 — Approved Firebase Administrator Login

This update restricts the admin panel UI to Firebase Authentication UID:
7D4nUPaMXIW6Lnz5ST7A6raV22O2

Other email accounts and anonymous Firebase sessions are immediately signed out.
The server-side Firestore security rules must still be restricted to this same UID.
The UI check alone is not a security boundary.

To update GitHub Pages: replace the existing repository files with the contents
of this website ZIP and allow GitHub Pages to redeploy. Refresh using Ctrl+F5.

Your desktop should use TriniD_Desktop_v3_0_13.py for administrator sync.
Do not put account passwords or API service-account private keys into GitHub.
