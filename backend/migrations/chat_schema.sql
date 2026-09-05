-- Migration: Create tables for ECC-secured chat between students and advisors

CREATE TABLE IF NOT EXISTS `user_ecc_key` (
  `user_id` INT NOT NULL PRIMARY KEY,
  `public_key_x` VARCHAR(100) NOT NULL,
  `public_key_y` VARCHAR(100) NOT NULL,
  `private_key` VARCHAR(100) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_ecc_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `chat_session` (
  `session_id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `student_id` INT NOT NULL,
  `advisor_id` INT NOT NULL,
  `student_encrypted_key` TEXT NOT NULL,
  `advisor_encrypted_key` TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_student_advisor_chat` (`student_id`, `advisor_id`),
  CONSTRAINT `fk_chat_student` FOREIGN KEY (`student_id`) REFERENCES `student` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_advisor` FOREIGN KEY (`advisor_id`) REFERENCES `advisor` (`advisor_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `chat_message` (
  `message_id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `session_id` INT NOT NULL,
  `sender_role` ENUM('student', 'advisor') NOT NULL,
  `sender_id` INT NOT NULL,
  `ciphertext` TEXT NOT NULL,
  `iv` VARCHAR(64) NOT NULL,
  `auth_tag` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_chat_session` FOREIGN KEY (`session_id`) REFERENCES `chat_session` (`session_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
