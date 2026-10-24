-- FEFO pick: medicine first (equality), then expiry (order), so the first
-- entry is the answer. Partial: only batches that still hold stock are in
-- the index, so 60,000 emptied history batches never slow it down.
CREATE INDEX idx_batches_fefo
    ON batches (medicine_id, expiry_date)
    WHERE quantity > 0;

-- recent history of one medicine, newest first (Audit log screen)
CREATE INDEX idx_events_medicine_time
    ON dispensing_events (medicine_id, event_timestamp DESC);

-- time window scans for the weekly report (v_top_week)
CREATE INDEX idx_events_time
    ON dispensing_events (event_timestamp);

-- opening a prescription
CREATE INDEX idx_items_prescription
    ON prescription_items (prescription_id);

-- case-insensitive prefix search on brand and generic name
CREATE INDEX idx_medicines_name_lower
    ON medicines (lower(name) text_pattern_ops);

CREATE INDEX idx_medicines_generic_lower
    ON medicines (lower(generic_name) text_pattern_ops);
