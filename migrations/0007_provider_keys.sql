-- Provider API keys entered through the admin panel.
--
-- Values are AES-256-GCM ciphertext produced by src/lib/ravi/keystore.server.ts
-- under RAVI_KEY_SECRET; plaintext keys never reach this table, and only masked
-- previews ever reach the browser.

CREATE TABLE IF NOT EXISTS provider_keys (
  name text PRIMARY KEY,
  value_ciphertext text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
