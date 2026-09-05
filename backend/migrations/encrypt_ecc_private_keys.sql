-- Add storage for RSA-wrapped ECC private keys.
ALTER TABLE `user_ecc_key`
  ADD COLUMN `private_key_encrypted` TEXT NULL;
