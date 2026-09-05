-- Add explicit HMAC integrity protection to chat messages.
ALTER TABLE `chat_message`
  ADD COLUMN `mac` VARCHAR(64) NULL;