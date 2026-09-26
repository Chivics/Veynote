ALTER TABLE `AuthSession`
  ADD COLUMN `lastActivityAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `inactivityMinutes` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `lockedAt` DATETIME(3) NULL,
  ADD COLUMN `reauthenticatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `reauthChallenge` VARCHAR(191) NULL,
  ADD COLUMN `reauthChallengeExpiresAt` DATETIME(3) NULL;

-- Installing protection is not itself a fresh identity verification.
UPDATE `AuthSession` SET `lastActivityAt` = `lastSeenAt`, `reauthenticatedAt` = `createdAt`;
