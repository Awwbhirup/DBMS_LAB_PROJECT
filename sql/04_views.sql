-- Reports are views, computed when they are read, so they can never be out of date.

-- stock per medicine; expired units are counted apart and never offered
CREATE VIEW v_stock AS
SELECT m.medicine_id,
       m.name,
       m.generic_name,
       COALESCE(SUM(b.quantity) FILTER (WHERE b.expiry_date > current_date), 0) AS usable_stock,
       COALESCE(SUM(b.quantity) FILTER (WHERE b.expiry_date <= current_date), 0) AS expired_stock,
       MIN(b.expiry_date) FILTER (WHERE b.quantity > 0 AND b.expiry_date > current_date) AS next_expiry,
       COUNT(b.batch_id) FILTER (WHERE b.quantity > 0) AS live_batches
FROM medicines m
LEFT JOIN batches b ON b.medicine_id = m.medicine_id
GROUP BY m.medicine_id, m.name, m.generic_name;

-- batches with stock that expire within 60 days
CREATE VIEW v_near_expiry AS
SELECT b.batch_id,
       b.batch_number,
       m.name,
       b.expiry_date,
       b.quantity,
       b.expiry_date - current_date AS days_left
FROM batches b
JOIN medicines m ON m.medicine_id = b.medicine_id
WHERE b.quantity > 0
  AND b.expiry_date <= current_date + 60
ORDER BY b.expiry_date;

-- units dispensed per medicine in the last 7 days (quantity_changed is
-- negative for a dispense, hence the minus sign)
CREATE VIEW v_top_week AS
SELECT m.medicine_id,
       m.name,
       -SUM(e.quantity_changed) AS units_dispensed,
       COUNT(*) AS dispenses
FROM dispensing_events e
JOIN medicines m ON m.medicine_id = e.medicine_id
WHERE e.event_type = 'DISPENSE'
  AND e.event_timestamp >= now() - interval '7 days'
GROUP BY m.medicine_id, m.name
ORDER BY units_dispensed DESC;

-- prescribed against already dispensed, per prescription line
CREATE VIEW v_prescription_progress AS
SELECT pi.prescription_id,
       pi.medicine_id,
       pi.quantity_prescribed,
       COALESCE(-SUM(e.quantity_changed) FILTER (WHERE e.event_type = 'DISPENSE'), 0) AS quantity_dispensed
FROM prescription_items pi
LEFT JOIN dispensing_events e
       ON e.prescription_id = pi.prescription_id
      AND e.medicine_id = pi.medicine_id
GROUP BY pi.prescription_id, pi.medicine_id, pi.quantity_prescribed;
