CREATE TABLE IF NOT EXISTS items (
  tenant_id VARCHAR(128) NOT NULL,
  namespace VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  key VARCHAR(255) NOT NULL,
  value_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, namespace, user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_items_lookup ON items (tenant_id, namespace, user_id, key);
CREATE INDEX IF NOT EXISTS idx_items_expiry ON items (expires_at);
