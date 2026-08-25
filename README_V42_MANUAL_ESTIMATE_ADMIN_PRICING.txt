TRINI-D FRONTEND V42

Changes
- Smart Quote does not run the slicer automatically after upload or settings changes.
- Customer clicks Estimate Price to calculate time, weight and price.
- Changing any setting clears the old result until Estimate Price is clicked again.
- Customer output is limited to preview, print inputs, estimated time, filament weight and estimated price.
- Material density/price/best-for card and model-stat strip were removed.
- Admin publishes the operational PLA+ and PETG+ HS pricing profiles to the public Smart Quote config.
- PETG+ on the customer page uses the Admin PETG+ HS operational profile.

Required backend
- Use Trini-D backend Stage 11 because it applies the exact Admin Price Calculator formula.
- After deployment, open Admin > Export / Settings and click Save Smart Quote Settings once to publish the pricing profiles.
