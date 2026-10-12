ALTER TABLE `LibraryItem` ADD COLUMN `deletedAt` DATETIME(3) NULL;

CREATE INDEX `LibraryItem_userId_deletedAt_idx` ON `LibraryItem`(`userId`, `deletedAt`);
