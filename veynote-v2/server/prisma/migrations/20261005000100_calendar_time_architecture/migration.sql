ALTER TABLE `CalendarEvent`
  ADD COLUMN `startsAtUtc` DATETIME(3) NULL,
  ADD COLUMN `endsAtUtc` DATETIME(3) NULL,
  ADD COLUMN `timeZone` VARCHAR(191) NULL,
  ADD COLUMN `allDay` BOOLEAN NULL,
  ADD COLUMN `recurrenceRule` VARCHAR(191) NULL,
  ADD COLUMN `recurrenceUntil` DATETIME(3) NULL,
  ADD COLUMN `reminderMinutes` JSON NULL;

CREATE INDEX `CalendarEvent_userId_startsAtUtc_idx` ON `CalendarEvent`(`userId`, `startsAtUtc`);
