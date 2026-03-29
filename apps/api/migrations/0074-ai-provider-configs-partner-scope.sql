BEGIN;

ALTER TABLE ai_provider_configs
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES partners(id);

UPDATE ai_provider_configs cfg
SET partner_id = org.partner_id
FROM organizations org
WHERE cfg.org_id = org.id
  AND cfg.partner_id IS NULL;

ALTER TABLE ai_provider_configs
  ALTER COLUMN partner_id SET NOT NULL;

DROP INDEX IF EXISTS ai_provider_configs_org_provider_unique_idx;
DROP INDEX IF EXISTS ai_provider_configs_org_id_idx;

CREATE UNIQUE INDEX IF NOT EXISTS ai_provider_configs_partner_provider_unique_idx
  ON ai_provider_configs (partner_id, provider);

CREATE INDEX IF NOT EXISTS ai_provider_configs_partner_id_idx
  ON ai_provider_configs (partner_id);

ALTER TABLE ai_provider_configs
  DROP COLUMN IF EXISTS org_id;

COMMIT;
