# Pharmacy Inventory & Prescription Management

Database Systems Lab (BCSE302P) project. PostgreSQL is the transactional core,
MongoDB the drug-interaction safety layer, Express the API, React the screens.

## Run it

Needs PostgreSQL 17 on 5432 and MongoDB on 27017, both running locally, and
Node 22.

    npm install
    npm run setup        build both databases from sql/ and mongo/
    npm run build        build the React app
    npm start            http://localhost:4000

Or double-click `RESET_DATA.bat`, then `START_DEMO.bat`.

`.env` holds the connection settings (not committed):

    PG_SUPERUSER, PG_SUPERPASS     used only by setup, to create roles and the database
    PGOWNER_USER, PGOWNER_PASSWORD owns the tables
    PGUSER, PGPASSWORD             the API's role: SELECT, INSERT, limited UPDATE
    PGHOST, PGPORT, PGDATABASE
    MONGO_URL, MONGO_DB
    PORT

`npm run smoke` runs the end-to-end checks against a running server.

## Layout

    sql/01_schema.sql       six tables, keys, CHECK constraints
    sql/02_indexes.sql      partial FEFO index, audit indexes
    sql/03_audit_guard.sql  trigger that makes dispensing_events append-only
    sql/04_views.sql        v_stock, v_near_expiry, v_top_week, v_prescription_progress
    sql/05_seed.sql         medicines, batches, 60,000 depleted history batches, prescriptions, events
    mongo/interactions.js   interaction documents of varying shape
    scripts/setup.js        creates roles, database, collection, validator, index; loads everything
    server/                 Express API; dispense.js holds the transaction
    web/                    React (Vite) screens
    docs/REVIEW 1/          Review 1 report (docx, pdf), script, how to present
    docs/diagrams/          model, schema, data flow, transaction flow
    docs/PRELIMINARY REVIEW/ the two earlier design reviews
