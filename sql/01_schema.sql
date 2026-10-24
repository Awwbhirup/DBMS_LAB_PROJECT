-- The six tables. Every rule that can be written as a constraint is written
-- here, so bad data is refused by the database itself and not only by the app.

-- pharmacists and the admin; every audit row names one of them
CREATE TABLE users (
    user_id      SERIAL PRIMARY KEY,
    name         VARCHAR(80)  NOT NULL,
    role         VARCHAR(20)  NOT NULL CHECK (role IN ('pharmacist', 'admin'))
);

-- one row per product; generic_name is what MongoDB is searched by
CREATE TABLE medicines (
    medicine_id  SERIAL PRIMARY KEY,
    name         VARCHAR(120) NOT NULL UNIQUE,
    generic_name VARCHAR(80)  NOT NULL,
    manufacturer VARCHAR(80)  NOT NULL,
    form         VARCHAR(30)  NOT NULL,
    strength     VARCHAR(30)  NOT NULL,
    pack         VARCHAR(40)  NOT NULL
);

-- one row per physical lot; the source of truth for stock
CREATE TABLE batches (
    batch_id      SERIAL PRIMARY KEY,
    medicine_id   INT          NOT NULL REFERENCES medicines(medicine_id) ON DELETE RESTRICT,
    batch_number  VARCHAR(30)  NOT NULL,
    expiry_date   DATE         NOT NULL,
    quantity      INT          NOT NULL CHECK (quantity >= 0),
    received_date DATE         NOT NULL DEFAULT current_date,
    UNIQUE (medicine_id, batch_number),
    CHECK (expiry_date > received_date)
);

-- the prescription header: who it is for and who wrote it
CREATE TABLE prescriptions (
    prescription_id SERIAL PRIMARY KEY,
    patient_name    VARCHAR(80) NOT NULL CHECK (length(trim(patient_name)) > 0),
    patient_age     INT         CHECK (patient_age BETWEEN 0 AND 120),
    doctor_name     VARCHAR(80) NOT NULL CHECK (length(trim(doctor_name)) > 0),
    issued_date     DATE        NOT NULL DEFAULT current_date
);

-- the many-to-many between prescriptions and medicines, with the quantity
CREATE TABLE prescription_items (
    item_id             SERIAL PRIMARY KEY,
    prescription_id     INT NOT NULL REFERENCES prescriptions(prescription_id) ON DELETE RESTRICT,
    medicine_id         INT NOT NULL REFERENCES medicines(medicine_id) ON DELETE RESTRICT,
    quantity_prescribed INT NOT NULL CHECK (quantity_prescribed > 0),
    UNIQUE (prescription_id, medicine_id)
);

-- append-only history of every stock movement (see 03_audit_guard.sql).
-- prescription_id is empty for receipts and walk-in sales.
-- A DISPENSE must reduce stock and a RECEIPT must increase it.
CREATE TABLE dispensing_events (
    event_id         BIGSERIAL   PRIMARY KEY,
    medicine_id      INT         NOT NULL REFERENCES medicines(medicine_id),
    batch_id         INT         NOT NULL REFERENCES batches(batch_id),
    prescription_id  INT         REFERENCES prescriptions(prescription_id),
    event_type       VARCHAR(30) NOT NULL CHECK (event_type IN ('DISPENSE', 'RECEIPT', 'ADJUSTMENT')),
    quantity_changed INT         NOT NULL CHECK (quantity_changed <> 0),
    performed_by     INT         NOT NULL REFERENCES users(user_id),
    event_timestamp  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (event_type <> 'DISPENSE' OR quantity_changed < 0),
    CHECK (event_type <> 'RECEIPT' OR quantity_changed > 0)
);
