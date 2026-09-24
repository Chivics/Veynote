ALTER TABLE `Folder` ADD COLUMN `parentId` VARCHAR(191) NULL;
CREATE INDEX `Folder_parentId_idx` ON `Folder`(`parentId`);
ALTER TABLE `Folder` ADD CONSTRAINT `Folder_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Folder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
