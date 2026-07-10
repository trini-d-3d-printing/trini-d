Trini-D Website v31 - Smart Quote Profit Margin Control

Added:
- Separate Smart Quote Profit Margin setting in Admin -> Export / Settings.
- Default: 75%.
- Setting is stored in Firestore at trinid/default/public/smartquote.
- Smart Quote public page signs in anonymously and listens to this setting in realtime.
- Open Smart Quote pages automatically recalculate the estimate whenever the admin margin changes.
- The normal admin Price Calculator margin field is not changed by this setting.
- Smart Quote estimate records now include the profitMargin used.

Firebase requirement:
- Anonymous Authentication must be enabled.
- Existing Firestore rule match /trinid/{document=**} with request.auth != null supports this subdocument.
