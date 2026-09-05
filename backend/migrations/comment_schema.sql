-- Comments visible to all authenticated roles. Each comment expires after 24 hours.
CREATE TABLE IF NOT EXISTS `comment` (
  `comment_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `content_encrypted` LONGTEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`comment_id`),
  KEY `idx_comment_expires_at` (`expires_at`),
  CONSTRAINT `fk_comment_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
