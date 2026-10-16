ALTER TABLE `TradingEntry`
  ADD COLUMN `archivedAt` DATETIME(3) NULL,
  ADD COLUMN `deletedAt` DATETIME(3) NULL;

CREATE INDEX `TradingEntry_userId_archivedAt_deletedAt_idx` ON `TradingEntry`(`userId`, `archivedAt`, `deletedAt`);
