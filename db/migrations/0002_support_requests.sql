-- Help / dispute requests raised by customers and mechanics (MVP_PLAN: "cancellation/help",
-- "intervene in cancelled/disputed jobs"). Admins work them from the dashboard.

CREATE TABLE support_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'mechanic')),
  request_id TEXT REFERENCES repair_requests(id) ON DELETE SET NULL,
  booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  topic TEXT NOT NULL
    CHECK (topic IN ('booking_issue', 'cancellation', 'quote_question', 'dispute', 'safety', 'account', 'other')),
  message TEXT NOT NULL CHECK (length(trim(message)) BETWEEN 10 AND 2000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution_note TEXT CHECK (resolution_note IS NULL OR length(resolution_note) <= 1000),
  resolved_by TEXT REFERENCES users(id),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (status = 'open' OR (resolved_at IS NOT NULL AND resolved_by IS NOT NULL))
) STRICT;
CREATE INDEX support_requests_status_idx ON support_requests(status, created_at);
CREATE INDEX support_requests_user_idx ON support_requests(user_id, created_at);

CREATE TRIGGER support_requests_valid_status_transition
BEFORE UPDATE OF status ON support_requests
WHEN NEW.status IS NOT OLD.status AND NOT (OLD.status = 'open' AND NEW.status = 'resolved')
BEGIN
  SELECT RAISE(ABORT, 'invalid_support_transition');
END;
