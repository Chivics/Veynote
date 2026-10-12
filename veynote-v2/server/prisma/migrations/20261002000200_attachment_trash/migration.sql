ALTER TABLE `Attachment` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `Attachment_userId_deletedAt_idx` ON `Attachment`(`userId`, `deletedAt`);
