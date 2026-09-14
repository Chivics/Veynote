CREATE TABLE `NoteCreationRequest` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `key` VARCHAR(36) NOT NULL,
  `payloadHash` CHAR(64) NOT NULL,
  `noteId` VARCHAR(191) NULL,
  `noteUpdatedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `NoteCreationRequest_userId_key_key` (`userId`, `key`),
  UNIQUE INDEX `NoteCreationRequest_noteId_key` (`noteId`),
  CONSTRAINT `NoteCreationRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `NoteCreationRequest_noteId_fkey` FOREIGN KEY (`noteId`) REFERENCES `Note` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
