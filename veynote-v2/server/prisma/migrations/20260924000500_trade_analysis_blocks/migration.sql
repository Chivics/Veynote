CREATE TABLE `TradeAnalysisBlock` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `tradingEntryId` VARCHAR(191) NOT NULL,
  `timeframe` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL DEFAULT 0,
  `marketStructure` TEXT NULL,
  `keyLevels` TEXT NULL,
  `liquidity` TEXT NULL,
  `bias` TEXT NULL,
  `setupReasoning` TEXT NULL,
  `confirmation` TEXT NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `TradeAnalysisBlock_tradingEntryId_timeframe_key`(`tradingEntryId`, `timeframe`),
  INDEX `TradeAnalysisBlock_tradingEntryId_position_idx`(`tradingEntryId`, `position`),
  INDEX `TradeAnalysisBlock_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TradeAnalysisBlock`
  ADD CONSTRAINT `TradeAnalysisBlock_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `TradeAnalysisBlock_tradingEntryId_fkey` FOREIGN KEY (`tradingEntryId`) REFERENCES `TradingEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
