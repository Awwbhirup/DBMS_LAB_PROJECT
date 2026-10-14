CREATE TABLE users (
    user_id      SERIAL PRIMARY KEY,
    name         VARCHAR(80)  NOT NULL,
    role         VARCHAR(20)  NOT NULL CHECK (role IN ('pharmacist', 'admin'))
);

CREATE TABLE medicines (
    medicine_id  SERIAL PRIMARY KEY,
    name         VARCHAR(120) NOT NULL UNIQUE,
    generic_name VARCHAR(80)  NOT NULL,
    manufacturer VARCHAR(80)  NOT NULL,
    form         VARCHAR(30)  NOT NULL,
    strength     VARCHAR(30)  NOT NULL,
    pack         VARCHAR(40)  NOT NULL
);

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

CREATE TABLE prescriptions (
    prescription_id SERIAL PRIMARY KEY,
    patient_name    VARCHAR(80) NOT NULL CHECK (length(trim(patient_name)) > 0),
    patient_age     INT         CHECK (patient_age BETWEEN 0 AND 120),
    doctor_name     VARCHAR(80) NOT NULL CHECK (length(trim(doctor_name)) > 0),
    issued_date     DATE        NOT NULL DEFAULT current_date
);

CREATE TABLE prescription_items (
    item_id             SERIAL PRIMARY KEY,
    prescription_id     INT NOT NULL REFERENCES prescriptions(prescription_id) ON DELETE RESTRICT,
    medicine_id         INT NOT NULL REFERENCES medicines(medicine_id) ON DELETE RESTRICT,
    quantity_prescribed INT NOT NULL CHECK (quantity_prescribed > 0),
    UNIQUE (prescription_id, medicine_id)
);

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
