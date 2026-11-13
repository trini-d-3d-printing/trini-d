Trini-D Website v68 — Admin dashboard uses Firestore Editor role instead of hardcoded previous owner UID.

Editor: anushka1official@gmail.com
Viewer: trinid3dprinting@gmail.com

Required Firestore role documents in trinid_roles collection:
  {NEW_EDITOR_FIREBASE_UID}: role = "editor"
  7D4nUPaMXIW6Lnz5ST7A6raV22O2: role = "viewer"

Publish matching Firestore rules before deploying, else site may reject all sign-ins.
Test Editor login + realtime synced; test viewer blocked from admin dashboard.
The public website pages otherwise retain v67 code.
