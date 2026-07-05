Trini-D Smart Quote v25 - STL Analysis Performance Fix

Changes:
- Replaced slow per-triangle THREE.Vector3 allocations with raw numeric geometry math.
- Large STL analysis runs in chunks and yields back to the browser so the UI stays responsive.
- Loading message now shows progress percentages during model analysis.
- Removed unnecessary normal recalculation when STL normals already exist.
- Added a 1,500,000-triangle safety limit with a clear message for excessively complex files.
- Added cache-busting to smartquote.js so browsers load the fixed script after deployment.

Admin panel is unchanged.
