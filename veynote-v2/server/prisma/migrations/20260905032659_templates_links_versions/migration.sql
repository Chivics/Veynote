-- AlterTable
ALTER TABLE `folder` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '📁';

-- CreateTable
CREATE TABLE `NoteVersion` (
    `id` VARCHAR(191) NOT NULL,
    `noteId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NoteVersion_noteId_idx`(`noteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NoteLink` (
    `id` VARCHAR(191) NOT NULL,
    `sourceNoteId` VARCHAR(191) NOT NULL,
    `targetNoteId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NoteLink_targetNoteId_idx`(`targetNoteId`),
    UNIQUE INDEX `NoteLink_sourceNoteId_targetNoteId_key`(`sourceNoteId`, `targetNoteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `NoteVersion` ADD CONSTRAINT `NoteVersion_noteId_fkey` FOREIGN KEY (`noteId`) REFERENCES `Note`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NoteLink` ADD CONSTRAINT `NoteLink_sourceNoteId_fkey` FOREIGN KEY (`sourceNoteId`) REFERENCES `Note`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NoteLink` ADD CONSTRAINT `NoteLink_targetNoteId_fkey` FOREIGN KEY (`targetNoteId`) REFERENCES `Note`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
