READABLE COPY OF THE DATABASES
==============================

PostgreSQL and MongoDB store their real data in their own binary files
(inside their installation folders), which cannot be opened directly.
This folder holds a readable copy of everything they contain.

  postgresql\users.csv
  postgresql\medicines.csv
  postgresql\batches.csv
  postgresql\prescriptions.csv
  postgresql\prescription_items.csv
  postgresql\dispensing_events.csv
  mongodb\drug_interactions.json

Each CSV has one column per table column and one line per row, in primary
key order, so a new prescription, a dispense or a received batch appears as
the last lines of the matching files. The CSV files open in Excel.

The copy is rewritten automatically by the server about half a second after
every change made in the app. SHOW_DATA.bat rewrites it by hand and opens
this folder; RESET_DATA.bat rewrites it after rebuilding the databases.

If a CSV is open in Excel while the app writes, that one file is skipped and
caught up on the next change. Close it and press SHOW_DATA.bat to refresh.
