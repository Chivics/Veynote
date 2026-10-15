CREATE TABLE `TradingRuleEvent` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `ruleId` VARCHAR(191) NOT NULL,
  `tradingEntryId` VARCHAR(191) NULL,
  `kind` VARCHAR(191) NOT NULL,
  `complianceStatus` VARCHAR(191) NOT NULL,
  `note` TEXT NULL,
  `correctiveAction` TEXT NULL,
  `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `TradingRuleEvent_userId_occurredAt_idx`(`userId`, `occurredAt`),
  INDEX `TradingRuleEvent_ruleId_occurredAt_idx`(`ruleId`, `occurredAt`),
  INDEX `TradingRuleEvent_tradingEntryId_idx`(`tradingEntryId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TradingRuleEvent` ADD CONSTRAINT `TradingRuleEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TradingRuleEvent` ADD CONSTRAINT `TradingRuleEvent_ruleId_fkey` FOREIGN KEY (`ruleId`) REFERENCES `TradingRule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TradingRuleEvent` ADD CONSTRAINT `TradingRuleEvent_tradingEntryId_fkey` FOREIGN KEY (`tradingEntryId`) REFERENCES `TradingEntry`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
