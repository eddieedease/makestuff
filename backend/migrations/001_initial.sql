CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(190) NOT NULL UNIQUE,
  name VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'user',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  last_login_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE auth_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX (user_id),
  CONSTRAINT fk_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE password_resets (
  token_hash CHAR(64) PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  CONSTRAINT fk_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE login_failures (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  key_hash CHAR(64) NOT NULL,
  failed_at DATETIME NOT NULL,
  INDEX (key_hash, failed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Every kind of learning lives here. `type` selects the behaviour, `content`
-- is a JSON document whose shape belongs to that type, so a new type needs no
-- schema change. LMSs only ever see `published_content`.
CREATE TABLE learning_objects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id VARCHAR(32) NOT NULL UNIQUE,
  owner_id INT UNSIGNED NOT NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  content LONGTEXT NOT NULL,
  published_content LONGTEXT NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX (owner_id),
  INDEX (type),
  CONSTRAINT fk_objects_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE media (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_name VARCHAR(64) NOT NULL UNIQUE,
  original_name VARCHAR(255) NOT NULL,
  mime VARCHAR(64) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  owner_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_media_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- An LMS that may launch our content. LTI 1.1 uses key + secret, LTI 1.3 uses
-- the issuer/client registration.
CREATE TABLE lti_connections (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  version VARCHAR(8) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  consumer_key VARCHAR(190) NULL UNIQUE,
  shared_secret VARCHAR(255) NULL,
  issuer VARCHAR(255) NULL,
  client_id VARCHAR(190) NULL,
  deployment_ids TEXT NULL,
  auth_login_url VARCHAR(500) NULL,
  auth_token_url VARCHAR(500) NULL,
  keyset_url VARCHAR(500) NULL,
  jwks_cache MEDIUMTEXT NULL,
  jwks_fetched_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  INDEX (issuer(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One-time values: OAuth 1 nonces (LTI 1.1) and OIDC state (LTI 1.3).
CREATE TABLE lti_nonces (
  value_hash CHAR(64) PRIMARY KEY,
  connection_id INT UNSIGNED NOT NULL,
  nonce VARCHAR(128) NULL,
  expires_at DATETIME NOT NULL,
  INDEX (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A learner's visit. LMSs embed us in an iframe where third-party cookies are
-- unreliable, so the player authenticates with this token instead of a cookie.
-- Author previews use the same table so there is only one player code path.
CREATE TABLE launch_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  kind VARCHAR(16) NOT NULL DEFAULT 'play',
  object_id INT UNSIGNED NULL,
  connection_id INT UNSIGNED NULL,
  lti_version VARCHAR(8) NULL,
  learner_ref VARCHAR(190) NOT NULL,
  learner_name VARCHAR(190) NULL,
  learner_email VARCHAR(190) NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'learner',
  context_title VARCHAR(255) NULL,
  resource_link_id VARCHAR(190) NULL,
  outcome_url VARCHAR(500) NULL,
  outcome_sourcedid VARCHAR(500) NULL,
  ags_lineitem VARCHAR(500) NULL,
  ags_can_score TINYINT(1) NOT NULL DEFAULT 0,
  deep_link LONGTEXT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  object_id INT UNSIGNED NOT NULL,
  connection_id INT UNSIGNED NULL,
  learner_ref VARCHAR(190) NOT NULL,
  learner_name VARCHAR(190) NULL,
  context_title VARCHAR(255) NULL,
  resource_link_id VARCHAR(190) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'in_progress',
  progress DECIMAL(5,4) NOT NULL DEFAULT 0,
  score DECIMAL(5,4) NULL,
  state LONGTEXT NULL,
  result LONGTEXT NULL,
  passback_status VARCHAR(16) NOT NULL DEFAULT 'none',
  passback_error VARCHAR(500) NULL,
  started_at DATETIME NOT NULL,
  completed_at DATETIME NULL,
  INDEX (object_id, learner_ref),
  CONSTRAINT fk_attempts_object FOREIGN KEY (object_id) REFERENCES learning_objects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE settings (
  name VARCHAR(64) PRIMARY KEY,
  value MEDIUMTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
