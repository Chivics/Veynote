ALTER TABLE `WillDocument`
  ADD COLUMN `contactId` VARCHAR(191) NULL,
  ADD COLUMN `executorId` VARCHAR(191) NULL,
  ADD COLUMN `liabilityId` VARCHAR(191) NULL;

CREATE INDEX `WillDocument_contactId_idx` ON `WillDocument`(`contactId`);
CREATE INDEX `WillDocument_executorId_idx` ON `WillDocument`(`executorId`);
CREATE INDEX `WillDocument_liabilityId_idx` ON `WillDocument`(`liabilityId`);

ALTER TABLE `WillDocument`
  ADD CONSTRAINT `WillDocument_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `WillContact`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `WillDocument_executorId_fkey` FOREIGN KEY (`executorId`) REFERENCES `WillExecutor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `WillDocument_liabilityId_fkey` FOREIGN KEY (`liabilityId`) REFERENCES `WillLiability`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
