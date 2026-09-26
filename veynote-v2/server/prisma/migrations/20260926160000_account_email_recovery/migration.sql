ALTER TABLE `User` ADD COLUMN `emailVerifiedAt` DATETIME(3) NULL;

CREATE TABLE `AuthEmailChallenge` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `purpose` ENUM('PASSWORD_RESET', 'VERIFY_EMAIL') NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `AuthEmailChallenge_tokenHash_key` (`tokenHash`),
  UNIQUE INDEX `AuthEmailChallenge_userId_purpose_key` (`userId`, `purpose`),
  INDEX `AuthEmailChallenge_expiresAt_idx` (`expiresAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `AuthEmailChallenge_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AuthEmailJob` (
  `id` VARCHAR(191) NOT NULL,
  `challengeId` VARCHAR(191) NOT NULL,
  `sealedToken` TEXT NOT NULL,
  `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `leaseUntil` DATETIME(3) NULL,
  `leaseId` VARCHAR(191) NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `sentAt` DATETIME(3) NULL,
  UNIQUE INDEX `AuthEmailJob_challengeId_key` (`challengeId`),
  INDEX `AuthEmailJob_sentAt_availableAt_leaseUntil_idx` (`sentAt`, `availableAt`, `leaseUntil`),
  PRIMARY KEY (`id`),
  CONSTRAINT `AuthEmailJob_challengeId_fkey` FOREIGN KEY (`challengeId`) REFERENCES `AuthEmailChallenge` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
