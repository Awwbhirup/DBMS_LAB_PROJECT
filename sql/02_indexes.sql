CREATE INDEX idx_batches_fefo
    ON batches (medicine_id, expiry_date)
    WHERE quantity > 0;

CREATE INDEX idx_events_medicine_time
    ON dispensing_events (medicine_id, event_timestamp DESC);

CREATE INDEX idx_events_time
    ON dispensing_events (event_timestamp);

CREATE INDEX idx_items_prescription
    ON prescription_items (prescription_id);

CREATE INDEX idx_medicines_name_lower
    ON medicines (lower(name) text_pattern_ops);

CREATE INDEX idx_medicines_generic_lower
    ON medicines (lower(generic_name) text_pattern_ops);
