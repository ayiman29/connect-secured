-- MySQL dump fixed & validated
-- Database: university5

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS manages;
DROP TABLE IF EXISTS section;
DROP TABLE IF EXISTS course;
DROP TABLE IF EXISTS advisor;
DROP TABLE IF EXISTS student;
DROP TABLE IF EXISTS registrar;
DROP TABLE IF EXISTS user;

-- ======================
-- USER
-- ======================
CREATE TABLE `user` (
  `email` varchar(100) NOT NULL,
  `name` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `user` VALUES
('aminul.islam@g.bracu.ac.bd','Aminul Islam','pass1234'),
('fatima.noor@g.bracu.ac.bd','Fatima Noor','password567'),
('forhad.emin.khan@bracu.ac.bd','Forhad Emin Khan','password1'),
('john.advisor@bracu.ac.bd','John Advisor','$2b$10$xfPEhRuhVPD68RUGELSu7uVKUTHk7XZO7JBfzlvp62ezZHsxyI85S'),
('john.registrar@bracu.ac.bd','John Registrar','$2b$10$tfiOQVtFC18fBKfZVvW4EuTbE0xL2g5gPjEkJ3N4wO5m7YeGJnw.O'),
('john.smith@bracu.ac.bd','John Smith','$2b$10$XTX7lD4JBTcwL8.vwT3GTuZcpZYBHR.OhUwRmezOpJlumlMD/PcG2'),
('mahmud.nayeem.sifat@bracu.ac.bd','Mahmud Nayeem Sifat','password3'),
('mirza.taqi.tahmid@g.bracu.ac.bd','Mirza Taqi Tahmid','$2b$10$YGkW9APKAGDLUaoaUmHKleRiTS.l477rH8ZNH9wAzSNFRzKCwBQwC'),
('mohammed.islam@g.bracu.ac.bd','Mohammed Islam','ij*RJUiAJ09jrf'),
('moist.critikal@g.bracu.ac.bd','Moist Critikal','$2b$10$etItnafIT3TJ4K5UIMj3CebtiLdHdaXBnpmxxdGt4MIPxKaLLd3U6'),
('muntaha.fatema.tahiat@g.bracu.ac.bd','Muntaha Fatema Tahiat','$2b$10$J2.G0/Xrke.FeMl2RjhFz.s4WrpDRVlag8y/yvuv2LhgzEDMTwEbG'),
('nusrat.jahan@g.bracu.ac.bd','Nusrat Jahan','nusrat789'),
('rafid.nazmul.faisal@bracu.ac.bd','Rafid Nazmul Faisal','password2'),
('rahim.uddin@g.bracu.ac.bd','Rahim Uddin','rahim2025'),
('raiyan.zakir.ayiman@g.bracu.ac.bd','Raiyan Zakir Ayiman','superhardpasswordnoonecancrack'),
('reza.tanjim@bracu.ac.bd','Reza Tanjim','$2b$10$hYwCQTnrTxduLN3n3C5K6.F96Yg8JNBVOlFCFn9p50wYCu.IOY9CG'),
('sam.hyde@g.bracu.ac.bd','Sam Hyde','$2b$10$nj.pbmVCtUXZJhjCnVYJX.98vzxFsr6X.GCHegCLgIM0RV1apDbJO'),
('shakib.ahmed@bracu.ac.bd','Md. Shakib Ahmed','password123'),
('tanjim.pial.hasan@bracu.ac.bd','Tanjim Pial Hasan','password4'),
('tanjim.reza@bracu.ac.bd','Tanjim Reza','$2b$10$i260sW3OYFSvbX8/CsuEOO5k2Ec8GZMwCmyLfxKnWFtlT2EQSEvAK'),
('tariq.hasan@g.bracu.ac.bd','Tariq Hasan','tariq321'),
('zahid.ahmed.rahman@bracu.ac.bd','Zahid Ahmed Rahman','password5');

-- ======================
-- REGISTRAR
-- ======================
CREATE TABLE `registrar` (
  `registrar_id` int NOT NULL,
  `email` varchar(100) NOT NULL,
  PRIMARY KEY (`registrar_id`),
  UNIQUE (`email`),
  FOREIGN KEY (`email`) REFERENCES `user`(`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `registrar` VALUES
(10012135,'john.registrar@bracu.ac.bd'),
(10012134,'shakib.ahmed@bracu.ac.bd');

-- ======================
-- ADVISOR
-- ======================
CREATE TABLE `advisor` (
  `advisor_id` int NOT NULL,
  `email` varchar(100) NOT NULL,
  PRIMARY KEY (`advisor_id`),
  UNIQUE (`email`),
  FOREIGN KEY (`email`) REFERENCES `user`(`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `advisor` VALUES
(10000501,'forhad.emin.khan@bracu.ac.bd'),
(10000502,'rafid.nazmul.faisal@bracu.ac.bd'),
(10000503,'mahmud.nayeem.sifat@bracu.ac.bd'),
(10000504,'tanjim.pial.hasan@bracu.ac.bd'),
(10000505,'zahid.ahmed.rahman@bracu.ac.bd'),
(10000506,'tanjim.reza@bracu.ac.bd'),
(10000507,'reza.tanjim@bracu.ac.bd'),
(10000509,'john.advisor@bracu.ac.bd');

-- ======================
-- STUDENT
-- ======================
CREATE TABLE `student` (
  `student_id` int NOT NULL,
  `email` varchar(100) NOT NULL,
  `credit` int DEFAULT 0,
  `status` enum('waiting','approved','denied'),
  PRIMARY KEY (`student_id`),
  UNIQUE (`email`),
  FOREIGN KEY (`email`) REFERENCES `user`(`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `student` VALUES
(23301001,'aminul.islam@g.bracu.ac.bd',15,NULL),
(23301002,'fatima.noor@g.bracu.ac.bd',3,NULL),
(23301003,'rahim.uddin@g.bracu.ac.bd',9,NULL),
(23301004,'nusrat.jahan@g.bracu.ac.bd',12,NULL),
(23301005,'tariq.hasan@g.bracu.ac.bd',15,NULL),
(23301006,'mohammed.islam@g.bracu.ac.bd',9,NULL),
(23301095,'john.smith@bracu.ac.bd',15,NULL),
(23301211,'raiyan.zakir.ayiman@g.bracu.ac.bd',60,NULL),
(23301241,'sam.hyde@g.bracu.ac.bd',42,'denied'),
(23301492,'moist.critikal@g.bracu.ac.bd',12,NULL),
(23341038,'muntaha.fatema.tahiat@g.bracu.ac.bd',84,'approved'),
(24141146,'mirza.taqi.tahmid@g.bracu.ac.bd',76,'approved');

-- ======================
-- COURSE
-- ======================
CREATE TABLE `course` (
  `course_id` int NOT NULL,
  `title` varchar(100),
  `name` varchar(100),
  `exam_schedule` datetime,
  `course_credit` int,
  `registrar_id` int NOT NULL,
  PRIMARY KEY (`course_id`),
  FOREIGN KEY (`registrar_id`) REFERENCES `registrar`(`registrar_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `course` VALUES
(110,'CSE110','Introduction to Programming','2025-11-28',3,10012135),
(113,'ENG113','Introduction to English Poetry','2025-11-27',3,10012135),
(422,'CSE422','Artificial Intelligence','2025-11-12',3,10012135);

-- ======================
-- SECTION
-- ======================
CREATE TABLE `section` (
  `course_id` int NOT NULL,
  `section_id` int NOT NULL,
  `schedule` varchar(100),
  `faculty` varchar(100),
  `seat_availability` int DEFAULT 40,
  PRIMARY KEY (`course_id`,`section_id`),
  FOREIGN KEY (`course_id`) REFERENCES `course`(`course_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `section` VALUES
(110,1,'MONDAY–WEDNESDAY 11:00–12:30','Mohammed Saiful Islam',38),
(110,2,'MONDAY–WEDNESDAY 12:30–14:00','Mohammed Saiful Islam',40),
(110,3,'MONDAY–WEDNESDAY 14:00–15:30','Rafi Abedin',40),
(110,4,'SUNDAY–TUESDAY 14:00–15:30','Rafi Abedin',40),
(113,1,'SUNDAY–TUESDAY 08:00–09:30','Sumaiya Tasnim',38),
(113,2,'SUNDAY–TUESDAY 09:30–11:00','Sumaiya Tasnim',40),
(422,1,'SUNDAY–TUESDAY 09:30–11:00','Ahmed Intelligence',41),
(422,2,'SUNDAY–TUESDAY 15:30–17:00','Ahmed Intelligence',39),
(422,3,'MONDAY–WEDNESDAY 08:00–09:30','Mohammed Islam',40),
(422,4,'MONDAY–WEDNESDAY 09:30–11:00','Mohammed Islam',40),
(422,5,'MONDAY–WEDNESDAY 09:30–11:00','Samiul Altman',39),
(422,6,'THURSDAY–SATURDAY 12:30–14:00','Samiul Altman',40);

-- ======================
-- MANAGES
-- ======================
CREATE TABLE `manages` (
  `course_id` int NOT NULL,
  `section_id` int NOT NULL,
  `student_id` int NOT NULL,
  `advisor_id` int NOT NULL,
  PRIMARY KEY (`course_id`,`section_id`,`student_id`,`advisor_id`),
  FOREIGN KEY (`course_id`,`section_id`) REFERENCES `section`(`course_id`,`section_id`) ON DELETE CASCADE,
  FOREIGN KEY (`student_id`) REFERENCES `student`(`student_id`),
  FOREIGN KEY (`advisor_id`) REFERENCES `advisor`(`advisor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `manages` VALUES
(110,4,23301241,10000501),
(113,1,23301241,10000501),
(422,3,23301241,10000501),
(110,1,23341038,10000501),
(113,1,23341038,10000501),
(422,5,23341038,10000501),
(110,1,24141146,10000501),
(113,1,24141146,10000501),
(422,2,24141146,10000501);

SET FOREIGN_KEY_CHECKS = 1;
