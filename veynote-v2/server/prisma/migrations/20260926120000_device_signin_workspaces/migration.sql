ALTER TABLE `User` ADD COLUMN `defaultWorkspace` VARCHAR(191) NULL;

CREATE TABLE `WebAuthnLoginChallenge` (
    `id` VARCHAR(191) NOT NULL,
    `challenge` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    INDEX `WebAuthnLoginChallenge_expiresAt_idx` (`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
