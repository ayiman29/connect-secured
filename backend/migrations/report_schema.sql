-- Migration: Create report table for RSA-encrypted student issue reports

CREATE TABLE IF NOT EXISTS `report` (
  `report_id` INT NOT NULL AUTO_INCREMENT,
  `student_id` INT NOT NULL,
  `encrypted_problem` LONGTEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`report_id`),
  CONSTRAINT `fk_report_student` FOREIGN KEY (`student_id`) REFERENCES `student` (`student_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

