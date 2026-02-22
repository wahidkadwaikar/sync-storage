CREATE TABLE IF NOT EXISTS items (
  tenant_id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, namespace, user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_items_lookup ON items (tenant_id, namespace, user_id, key);
CREATE INDEX IF NOT EXISTS idx_items_expiry ON items (expires_at);
