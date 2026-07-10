Trini-D Website/Admin v29 — Material-Specific Calculator Profiles

What changed in Admin > Price Calculator:
- Added a Selected Material Profile dropdown.
- Added separate editable Operational Base values for each filament profile.
- Every calculation uses the currently selected material profile.
- Editing Filament Price, Density, Diameter, Power, Electricity, Printer Cost,
  Printer Lifetime, Failure Risk, UPS Cost, or UPS Lifetime saves only to the
  selected material profile.
- Profiles persist in the local database and Firebase cloud database.
- Old databases are migrated automatically: the previous calculator config is
  preserved as the PLA+ profile.
- Added Reset Selected Profile button.

Included profiles cover common consumer, engineering, flexible, support,
composite and high-temperature FDM/FFF filament families, plus Custom.

Important:
The starter material prices and densities are editable defaults. Update each
profile to match your actual spool supplier, printer setup, electricity rate,
printer cost/lifetime, and failure risk before relying on production quotes.
