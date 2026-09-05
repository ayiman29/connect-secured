-- Add RSA-encrypted columns for course and section descriptive data.
ALTER TABLE `course`
  ADD COLUMN `title_encrypted` LONGTEXT NULL,
  ADD COLUMN `name_encrypted` LONGTEXT NULL,
  ADD COLUMN `exam_schedule_encrypted` LONGTEXT NULL;

ALTER TABLE `section`
  ADD COLUMN `schedule_encrypted` LONGTEXT NULL,
  ADD COLUMN `faculty_encrypted` LONGTEXT NULL;
