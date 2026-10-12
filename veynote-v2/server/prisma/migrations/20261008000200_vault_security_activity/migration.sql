CREATE TABLE `VaultSecurityEvent` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `scope` VARCHAR(32) NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `method` VARCHAR(32) NOT NULL,
  `outcome` VARCHAR(24) NOT NULL,
  `deviceLabel` VARCHAR(100) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `VaultSecurityEvent_userId_createdAt_idx` (`userId`, `createdAt`),
  INDEX `VaultSecurityEvent_userId_scope_createdAt_idx` (`userId`, `scope`, `createdAt`),
  CONSTRAINT `VaultSecurityEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
