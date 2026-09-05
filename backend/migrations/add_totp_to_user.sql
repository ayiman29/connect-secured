-- Migration: Add TOTP 2FA columns to the user table
-- Run once against the university5 database.

ALTER TABLE `user`
  ADD COLUMN `totp_secret`  TEXT         NULL    COMMENT 'AES-256-GCM encrypted TOTP secret',
  ADD COLUMN `totp_enabled` TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 = user has completed 2FA enrolment';

