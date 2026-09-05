-- Encrypted schema for Course Advising and Registration API
-- User PII fields are encrypted at rest in application layer.

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS manages;
DROP TABLE IF EXISTS section;
DROP TABLE IF EXISTS course;
DROP TABLE IF EXISTS advisor;
DROP TABLE IF EXISTS student;
DROP TABLE IF EXISTS registrar;
DROP TABLE IF EXISTS user;

CREATE TABLE `user` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `email_encrypted` text NOT NULL,
  `email_lookup` varchar(80) NOT NULL,
  `name_encrypted` text NOT NULL,
  `address_encrypted` text NOT NULL,
  `phone_encrypted` text NOT NULL,
  `password` varchar(255) NOT NULL,
  `pii_key_version` varchar(16) NOT NULL DEFAULT 'v1',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_user_email_lookup` (`email_lookup`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `registrar` (
  `registrar_id` int NOT NULL,
  `user_id` int NOT NULL,
  PRIMARY KEY (`registrar_id`),
  UNIQUE KEY `uq_registrar_user_id` (`user_id`),
  CONSTRAINT `fk_registrar_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `advisor` (
  `advisor_id` int NOT NULL,
  `user_id` int NOT NULL,
  PRIMARY KEY (`advisor_id`),
  UNIQUE KEY `uq_advisor_user_id` (`user_id`),
  CONSTRAINT `fk_advisor_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `student` (
  `student_id` int NOT NULL,
  `user_id` int NOT NULL,
  `credit` int DEFAULT 0,
  `status` enum('waiting','approved','denied'),
  PRIMARY KEY (`student_id`),
  UNIQUE KEY `uq_student_user_id` (`user_id`),
  CONSTRAINT `fk_student_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `course` (
  `course_id` int NOT NULL,
  `title_encrypted` text,
  `name_encrypted` text,
  `exam_schedule_encrypted` text,
  `course_credit` int,
  `registrar_id` int NOT NULL,
  PRIMARY KEY (`course_id`),
  CONSTRAINT `fk_course_registrar` FOREIGN KEY (`registrar_id`) REFERENCES `registrar`(`registrar_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `section` (
  `course_id` int NOT NULL,
  `section_id` int NOT NULL,
  `schedule_encrypted` text,
  `faculty_encrypted` text,
  `seat_availability` int DEFAULT 40,
  PRIMARY KEY (`course_id`,`section_id`),
  CONSTRAINT `fk_section_course` FOREIGN KEY (`course_id`) REFERENCES `course`(`course_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `manages` (
  `course_id` int NOT NULL,
  `section_id` int NOT NULL,
  `student_id` int NOT NULL,
  `advisor_id` int NOT NULL,
  PRIMARY KEY (`course_id`,`section_id`,`student_id`,`advisor_id`),
  CONSTRAINT `fk_manages_section` FOREIGN KEY (`course_id`,`section_id`) REFERENCES `section`(`course_id`,`section_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_manages_student` FOREIGN KEY (`student_id`) REFERENCES `student`(`student_id`),
  CONSTRAINT `fk_manages_advisor` FOREIGN KEY (`advisor_id`) REFERENCES `advisor`(`advisor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
