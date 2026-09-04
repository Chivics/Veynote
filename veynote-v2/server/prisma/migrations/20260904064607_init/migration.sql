-- AlterTable
ALTER TABLE `attachment` ADD COLUMN `tradingEntryId` VARCHAR(191) NULL,
    MODIFY `noteId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `folder` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '📁';

-- AlterTable
ALTER TABLE `note` ADD COLUMN `isLocked` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `isWill` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `lockedNotesPasswordHash` VARCHAR(191) NULL,
    ADD COLUMN `webauthnChallenge` VARCHAR(191) NULL,
    ADD COLUMN `webauthnChallengeExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `willPasswordHash` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `FileNode` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `isDirectory` BOOLEAN NOT NULL DEFAULT false,
    `storedName` VARCHAR(191) NULL,
    `mimeType` VARCHAR(191) NULL,
    `sizeBytes` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FileNode_userId_idx`(`userId`),
    INDEX `FileNode_parentId_idx`(`parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebAuthnCredential` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `credentialId` VARCHAR(191) NOT NULL,
    `publicKey` LONGBLOB NOT NULL,
    `counter` INTEGER NOT NULL DEFAULT 0,
    `transports` VARCHAR(191) NULL,
    `deviceLabel` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WebAuthnCredential_credentialId_key`(`credentialId`),
    INDEX `WebAuthnCredential_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Attachment_tradingEntryId_idx` ON `Attachment`(`tradingEntryId`);

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_tradingEntryId_fkey` FOREIGN KEY (`tradingEntryId`) REFERENCES `TradingEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FileNode` ADD CONSTRAINT `FileNode_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FileNode` ADD CONSTRAINT `FileNode_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `FileNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebAuthnCredential` ADD CONSTRAINT `WebAuthnCredential_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
