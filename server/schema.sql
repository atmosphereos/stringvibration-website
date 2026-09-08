-- Intake form submissions for Вибрация струн (MySQL 8).
-- One row per accepted client request.

CREATE TABLE IF NOT EXISTS requests (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ref             VARCHAR(64)   NOT NULL,                  -- human-facing №, e.g. "Ф-01 · 482 / 2026"
  idempotency_key VARCHAR(64)   NOT NULL,                  -- client-generated UUID; blocks double-submit
  service         VARCHAR(16)   NOT NULL,
  name            VARCHAR(200)  NOT NULL,
  email           VARCHAR(200)  NOT NULL,
  phone           VARCHAR(40)   NOT NULL,
  machine         VARCHAR(120)  NULL,
  region          VARCHAR(200)  NULL,
  message         TEXT          NULL,
  consent         TINYINT(1)    NOT NULL,
  ip              VARCHAR(45)   NULL,                       -- holds IPv4 or IPv6
  user_agent      VARCHAR(500)  NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_requests_ref  (ref),
  UNIQUE KEY uq_requests_idem (idempotency_key),
  KEY ix_requests_created_at  (created_at),
  CONSTRAINT ck_requests_service
    CHECK (service IN ('alignment','balancing','diagnostics','consult'))
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
