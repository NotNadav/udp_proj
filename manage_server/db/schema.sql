-- udp proxy db schema
-- engine: mysql


CREATE DATABASE IF NOT EXISTS udp_proxy_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE udp_proxy_db;

-- users table
CREATE TABLE IF NOT EXISTS users (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username     VARCHAR(64)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role         ENUM('admin','user') NOT NULL DEFAULT 'user',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username)
) ENGINE=InnoDB;

-- policies table
-- action priorities: block > tunnel > direct
CREATE TABLE IF NOT EXISTS policies (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED NOT NULL,
    domain     VARCHAR(253) NOT NULL,
    action     ENUM('BLOCK','TUNNEL','DIRECT') NOT NULL DEFAULT 'DIRECT',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_policies_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    UNIQUE KEY uq_user_domain (user_id, domain),
    INDEX idx_policies_user (user_id)
) ENGINE=InnoDB;

-- traffic logs
CREATE TABLE IF NOT EXISTS traffic_logs (
    id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED NOT NULL,
    domain     VARCHAR(253) NOT NULL DEFAULT '',
    bytes_sent BIGINT UNSIGNED NOT NULL DEFAULT 0,
    timestamp  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_logs_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    INDEX idx_logs_user_time (user_id, timestamp),
    INDEX idx_logs_time      (timestamp)
) ENGINE=InnoDB;

-- default admin account (pass: admin123)
-- change this in prod
INSERT IGNORE INTO users (username, password_hash, role)
VALUES (
    'admin',
    '$2a$10$xJnsTwBr5J7iS8RErRYOlO/QlpXmwIILctfXG.GwhLKtQKOxTiNVK',
    'admin'
);
