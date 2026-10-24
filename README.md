# Pharmacy Inventory & Prescription Management

Database Systems Lab (BCSE302P), Team 6. PostgreSQL is the transactional core,
MongoDB the drug-interaction safety layer, Express the API, React the screens.

## Run it

Needs PostgreSQL 17 on 5432 and MongoDB on 27017, both running locally, and
Node 22. Copy `.env.example` to `.env` and fill in the passwords, then:

    npm install
    npm run setup        build both databases from sql/ and mongo/
    npm run build        build the React app
    npm start            http://localhost:4000

Or double-click `RESET_DATA.bat`, then `START_DEMO.bat`.

`npm run smoke` runs the 24 end-to-end checks against a running server.

## Where the data is

PostgreSQL and MongoDB keep their data in their own binary files. The server
writes a readable copy of every table and of the interaction collection to
`data/` after every change (`data/postgresql/*.csv`,
`data/mongodb/drug_interactions.json`). `SHOW_DATA.bat` refreshes it and opens
the folder.

## Layout

    sql/01_schema.sql       six tables, keys, CHECK constraints
    sql/02_indexes.sql      partial FEFO index, audit indexes
    sql/03_audit_guard.sql  trigger that makes dispensing_events append-only
    sql/04_views.sql        v_stock, v_near_expiry, v_top_week, v_prescription_progress
    sql/05_seed.sql         medicines, batches, 60,000 depleted history batches, prescriptions, events
    mongo/interactions.js   interaction documents of varying shape
    scripts/setup.js        creates roles, database, collection, validator, index; loads everything
    scripts/export.js       writes the readable copy in data/ by hand
    scripts/smoke.js        end-to-end checks
    server/                 Express API; dispense.js holds the transaction, snapshot.js the data copy
    web/                    React (Vite) screens
    data/                   readable copy of both databases
    docs/                   reports, diagrams, earlier reviews
