CREATE TABLE `TradingReportShare` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `accountId` VARCHAR(191) NULL,
  `token` VARCHAR(64) NOT NULL,
  `title` VARCHAR(140) NOT NULL,
  `fromDate` DATETIME(3) NULL,
  `toDate` DATETIME(3) NULL,
  `showPnl` BOOLEAN NOT NULL DEFAULT false,
  `showAccountName` BOOLEAN NOT NULL DEFAULT false,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `TradingReportShare_token_key`(`token`),
  INDEX `TradingReportShare_userId_idx`(`userId`),
  INDEX `TradingReportShare_accountId_idx`(`accountId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TradingReportShare`
  ADD CONSTRAINT `TradingReportShare_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TradingReportShare`
  ADD CONSTRAINT `TradingReportShare_accountId_fkey`
  FOREIGN KEY (`accountId`) REFERENCES `TradingAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
