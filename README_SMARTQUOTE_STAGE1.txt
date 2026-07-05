TRINI-D WEBSITE v24 — SMART QUOTE STAGE 1

Added:
- New public smartquote.html page
- Drag/drop or browse .STL upload (max 50 MB)
- Interactive 3D preview (rotate, zoom, pan)
- Browser-side STL geometry analysis
- Dimensions, triangle count, solid volume and file size
- Material: PLA+, PLA, PETG, TPU, ABS
- Color choices with default PLA+ / Black
- Quality profiles: Draft 0.28, Standard 0.20, High 0.16, Ultra 0.12 mm
- Infill slider
- Quantity
- Preliminary estimated time, weight, filament length and customer price
- Upward rupee rounding
- "Use in Quotation Request" handoff to existing quotation.html
- Smart Quote details automatically prefill the manual quotation request
- Smart Quote navigation added across the public website
- Existing admin panel kept unchanged

IMPORTANT:
This Stage 1 estimator is geometry-based in the browser. It is NOT a real slicer.
Final customer price should be confirmed after slicer review.

Stage 2 target:
Connect the same UI to a Trini-D Quote API running a real slicer/printer profile.

THREE.JS:
The 3D preview loads Three.js modules from jsDelivr CDN. Internet access is required for the preview modules.
