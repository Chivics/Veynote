ALTER TABLE `TradingEntry`
  ADD COLUMN `isDraft` BOOLEAN NOT NULL DEFAULT false;

DROP INDEX `TradingEntry_userId_archivedAt_deletedAt_idx` ON `TradingEntry`;
CREATE INDEX `TradingEntry_userId_archivedAt_deletedAt_isDraft_idx`
  ON `TradingEntry`(`userId`, `archivedAt`, `deletedAt`, `isDraft`);
