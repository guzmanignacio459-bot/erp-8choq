-- Esquema de Meta para 8Q COMMANDS. Aplicado en Neon staging el 2026-11-22.
-- No toca las tablas de SHELBY y no modifica netos de PILAR.
-- El grano que entra en los filtros es el día de cuenta. El rango queda solo para auditoría.
-- Una fila de campaña no se suma a la fila de cuenta.

CREATE TABLE IF NOT EXISTS meta_8q_insight_daily (
  ad_account_id text NOT NULL,
  day date NOT NULL,
  spend numeric(14,2) NOT NULL,
  impressions integer,
  clicks integer,
  purchases integer,
  purchase_value numeric(14,2),
  cpa numeric(14,2),
  roas numeric(14,4),
  currency text,
  timezone text NOT NULL,
  attribution text,
  partial boolean NOT NULL DEFAULT false,
  read_at timestamptz NOT NULL,
  PRIMARY KEY (ad_account_id, day)
);

CREATE TABLE IF NOT EXISTS meta_8q_campaign_daily (
  ad_account_id text NOT NULL,
  campaign_id text NOT NULL,
  day date NOT NULL,
  campaign_name text,
  spend numeric(14,2) NOT NULL,
  impressions integer,
  clicks integer,
  purchases integer,
  purchase_value numeric(14,2),
  currency text,
  timezone text NOT NULL,
  attribution text,
  read_at timestamptz NOT NULL,
  PRIMARY KEY (ad_account_id, campaign_id, day)
);

CREATE TABLE IF NOT EXISTS meta_8q_range_audit (
  ad_account_id text NOT NULL,
  level text NOT NULL,
  since_day date NOT NULL,
  until_day date NOT NULL,
  spend numeric(14,2) NOT NULL,
  purchases integer,
  purchase_value numeric(14,2),
  attribution text,
  read_at timestamptz NOT NULL,
  PRIMARY KEY (ad_account_id, level, since_day, until_day, read_at)
);

CREATE TABLE IF NOT EXISTS meta_8q_sync_cursor (
  ad_account_id text PRIMARY KEY,
  last_day date,
  token_expires_on date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  lock_until timestamptz,
  last_status text,
  last_error text
);
