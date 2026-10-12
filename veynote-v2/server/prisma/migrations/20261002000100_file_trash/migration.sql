ALTER TABLE `FileNode` ADD COLUMN `deletedAt` DATETIME(3) NULL;

CREATE INDEX `FileNode_userId_deletedAt_idx` ON `FileNode`(`userId`, `deletedAt`);
