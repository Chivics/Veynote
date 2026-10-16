CREATE TABLE `TradingPlaybook` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(140) NOT NULL,
  `description` LONGTEXT NULL,
  `market` VARCHAR(120) NULL,
  `preferredDirection` VARCHAR(32) NULL,
  `sessions` VARCHAR(255) NULL,
  `timeframes` VARCHAR(255) NULL,
  `entryCriteria` LONGTEXT NULL,
  `confirmationCriteria` LONGTEXT NULL,
  `invalidationCriteria` LONGTEXT NULL,
  `riskPlan` LONGTEXT NULL,
  `reviewNotes` LONGTEXT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `TradingPlaybook_userId_title_key`(`userId`, `title`),
  INDEX `TradingPlaybook_userId_status_idx`(`userId`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `TradingPlaybook_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TradingEntry`
  ADD COLUMN `playbookId` VARCHAR(191) NULL,
  ADD INDEX `TradingEntry_playbookId_idx`(`playbookId`),
  ADD CONSTRAINT `TradingEntry_playbookId_fkey` FOREIGN KEY (`playbookId`) REFERENCES `TradingPlaybook`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
