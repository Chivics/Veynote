-- Persist the structured evidence captured by the professional trade workflow.
ALTER TABLE `TradingEntry`
  ADD COLUMN `marketRegime` VARCHAR(191) NULL,
  ADD COLUMN `liquidityNarrative` TEXT NULL,
  ADD COLUMN `structureNarrative` TEXT NULL,
  ADD COLUMN `confirmationSignal` TEXT NULL,
  ADD COLUMN `invalidationSignal` TEXT NULL,
  ADD COLUMN `emotionBefore` VARCHAR(191) NULL,
  ADD COLUMN `impulseLevel` VARCHAR(191) NULL,
  ADD COLUMN `disciplineNotes` TEXT NULL,
  ADD COLUMN `exitReasoning` TEXT NULL,
  ADD COLUMN `nextImprovement` TEXT NULL;
