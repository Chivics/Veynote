ALTER TABLE `WillAsset`
  ADD COLUMN `currency` VARCHAR(191) NULL,
  ADD COLUMN `institution` VARCHAR(191) NULL,
  ADD COLUMN `instructionType` VARCHAR(191) NULL,
  ADD COLUMN `responsibleExecutorId` VARCHAR(191) NULL;

CREATE TABLE `WillAssetAllocation` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `willId` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  `beneficiaryId` VARCHAR(191) NOT NULL,
  `allocationType` VARCHAR(191) NOT NULL DEFAULT 'PERCENTAGE',
  `percentage` DOUBLE NULL,
  `specificAmount` VARCHAR(191) NULL,
  `conditions` TEXT NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `WillAssetAllocation_assetId_beneficiaryId_key`(`assetId`, `beneficiaryId`),
  INDEX `WillAssetAllocation_beneficiaryId_idx`(`beneficiaryId`),
  INDEX `WillAssetAllocation_willId_idx`(`willId`),
  INDEX `WillAssetAllocation_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `WillAsset_responsibleExecutorId_idx` ON `WillAsset`(`responsibleExecutorId`);
ALTER TABLE `WillAsset` ADD CONSTRAINT `WillAsset_responsibleExecutorId_fkey` FOREIGN KEY (`responsibleExecutorId`) REFERENCES `WillExecutor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `WillAssetAllocation` ADD CONSTRAINT `WillAssetAllocation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WillAssetAllocation` ADD CONSTRAINT `WillAssetAllocation_willId_fkey` FOREIGN KEY (`willId`) REFERENCES `Will`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WillAssetAllocation` ADD CONSTRAINT `WillAssetAllocation_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `WillAsset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WillAssetAllocation` ADD CONSTRAINT `WillAssetAllocation_beneficiaryId_fkey` FOREIGN KEY (`beneficiaryId`) REFERENCES `WillBeneficiary`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
