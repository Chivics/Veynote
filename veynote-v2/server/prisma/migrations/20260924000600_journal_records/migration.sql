ALTER TABLE `Note`
  ADD COLUMN `kind` ENUM('NOTE', 'JOURNAL') NOT NULL DEFAULT 'NOTE';

CREATE INDEX `Note_userId_kind_entryDate_idx` ON `Note`(`userId`, `kind`, `entryDate`);
