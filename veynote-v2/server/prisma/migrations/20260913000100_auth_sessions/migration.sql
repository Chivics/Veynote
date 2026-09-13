ALTER TABLE `User` ADD COLUMN `sessionGeneration` INTEGER NOT NULL DEFAULT 0;
CREATE TABLE `AuthSession` (
  `id` VARCHAR(64) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `deviceLabel` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `AuthSession_userId_revokedAt_expiresAt_idx` (`userId`, `revokedAt`, `expiresAt`),
  CONSTRAINT `AuthSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
