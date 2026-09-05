-- Add encrypted address and phone fields to existing user records.
ALTER TABLE `user`
  ADD COLUMN `address_encrypted` TEXT NULL,
  ADD COLUMN `phone_encrypted` TEXT NULL;