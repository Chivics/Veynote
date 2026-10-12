CREATE TABLE `NoteDocumentRevision` (
  `id` VARCHAR(191) NOT NULL,
  `noteId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `clientRequestId` VARCHAR(36) NOT NULL,
  `expectedUpdatedAt` DATETIME(3) NOT NULL,
  `totalBytes` INTEGER NOT NULL,
  `chunkCount` INTEGER NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'STAGING',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `NoteDocumentRevision_userId_clientRequestId_key`(`userId`, `clientRequestId`),
  INDEX `NoteDocumentRevision_noteId_status_createdAt_idx`(`noteId`, `status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `NoteDocumentChunk` (
  `id` VARCHAR(191) NOT NULL,
  `revisionId` VARCHAR(191) NOT NULL,
  `ordinal` INTEGER NOT NULL,
  `sizeBytes` INTEGER NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `bytes` MEDIUMBLOB NOT NULL,
  UNIQUE INDEX `NoteDocumentChunk_revisionId_ordinal_key`(`revisionId`, `ordinal`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `NoteDocumentRevision` ADD CONSTRAINT `NoteDocumentRevision_noteId_fkey` FOREIGN KEY (`noteId`) REFERENCES `Note`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `NoteDocumentChunk` ADD CONSTRAINT `NoteDocumentChunk_revisionId_fkey` FOREIGN KEY (`revisionId`) REFERENCES `NoteDocumentRevision`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
