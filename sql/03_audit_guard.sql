-- Makes dispensing_events append-only for everyone, including the owner.
-- The API role is already refused by privileges (no UPDATE/DELETE granted in
-- setup.js); these triggers also stop the role that owns the table.

CREATE OR REPLACE FUNCTION reject_audit_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'dispensing_events is append-only: % is not allowed', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_events_no_update
    BEFORE UPDATE OR DELETE ON dispensing_events
    FOR EACH ROW EXECUTE FUNCTION reject_audit_change();

-- TRUNCATE does not fire row triggers, so it needs its own
CREATE TRIGGER trg_events_no_truncate
    BEFORE TRUNCATE ON dispensing_events
    FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_change();
