CREATE OR REPLACE FUNCTION reject_audit_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'dispensing_events is append-only: % is not allowed', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_events_no_update
    BEFORE UPDATE OR DELETE ON dispensing_events
    FOR EACH ROW EXECUTE FUNCTION reject_audit_change();

CREATE TRIGGER trg_events_no_truncate
    BEFORE TRUNCATE ON dispensing_events
    FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_change();
