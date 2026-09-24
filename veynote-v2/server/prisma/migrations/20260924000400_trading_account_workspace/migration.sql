ALTER TABLE `TradingAccount`
  ADD COLUMN `accountType` VARCHAR(191) NULL,
  ADD COLUMN `currency` VARCHAR(191) NULL DEFAULT 'USD',
  ADD COLUMN `startingBalance` DOUBLE NULL,
  ADD COLUMN `currentBalance` DOUBLE NULL,
  ADD COLUMN `equity` DOUBLE NULL,
  ADD COLUMN `dailyLossLimit` DOUBLE NULL,
  ADD COLUMN `drawdownLimit` DOUBLE NULL,
  ADD COLUMN `profitTarget` DOUBLE NULL,
  ADD COLUMN `notes` TEXT NULL;

ALTER TABLE `TradingEntry`
  ADD COLUMN `positionSize` DOUBLE NULL,
  ADD COLUMN `riskAmount` DOUBLE NULL,
  ADD COLUMN `profitLoss` DOUBLE NULL,
  ADD COLUMN `session` VARCHAR(191) NULL;

ALTER TABLE `TradingRule`
  ADD COLUMN `accountId` VARCHAR(191) NULL,
  ADD COLUMN `complianceStatus` VARCHAR(191) NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN `limitValue` DOUBLE NULL,
  ADD COLUMN `limitUnit` VARCHAR(191) NULL,
  ADD COLUMN `reviewDate` DATETIME(3) NULL;

CREATE INDEX `TradingRule_accountId_idx` ON `TradingRule`(`accountId`);

ALTER TABLE `TradingRule`
  ADD CONSTRAINT `TradingRule_accountId_fkey`
  FOREIGN KEY (`accountId`) REFERENCES `TradingAccount`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
