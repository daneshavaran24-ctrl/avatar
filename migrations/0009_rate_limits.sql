-- Fixed-window rate limit counters for the public endpoints.
--
-- Kept in Postgres rather than process memory so limits survive restarts and
-- stay correct if the app ever runs more than one instance. bucket_key encodes
-- the action plus the subject (visitor id or client IP), e.g.
-- "ask:visitor:<uuid>" or "avatar:global".

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

-- Supports pruning windows that have aged out.
CREATE INDEX IF NOT EXISTS rate_limit_counters_window_idx ON rate_limit_counters(window_start);
