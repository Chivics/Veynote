ALTER TABLE `Task` ADD COLUMN `deletedAt` DATETIME(3) NULL;

CREATE INDEX `Task_userId_deletedAt_idx` ON `Task`(`userId`, `deletedAt`);
