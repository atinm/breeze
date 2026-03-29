BEGIN;

ALTER TABLE ai_sessions
  ADD COLUMN IF NOT EXISTS provider varchar(20) NOT NULL DEFAULT 'claude',
  ADD COLUMN IF NOT EXISTS provider_model varchar(120),
  ADD COLUMN IF NOT EXISTS provider_session_id varchar(255);

UPDATE ai_sessions
SET provider_model = COALESCE(provider_model, model, 'claude-sonnet-4-5-20250929')
WHERE provider_model IS NULL;

ALTER TABLE ai_sessions
  ALTER COLUMN provider_model SET NOT NULL;

CREATE INDEX IF NOT EXISTS ai_sessions_provider_idx
  ON ai_sessions (provider);

CREATE INDEX IF NOT EXISTS ai_sessions_provider_model_idx
  ON ai_sessions (provider, provider_model);

CREATE TABLE IF NOT EXISTS ai_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  provider varchar(20) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  default_model varchar(120) NOT NULL,
  allowed_models jsonb,
  endpoint text,
  api_key_ref text,
  options jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_provider_configs_org_provider_unique_idx
  ON ai_provider_configs (org_id, provider);

CREATE INDEX IF NOT EXISTS ai_provider_configs_org_id_idx
  ON ai_provider_configs (org_id);

COMMIT;
