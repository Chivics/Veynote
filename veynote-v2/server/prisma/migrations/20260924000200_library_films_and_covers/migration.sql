ALTER TABLE `LibraryItem`
  MODIFY `database` ENUM('READING', 'FILMS', 'LIFE_GOALS', 'TRAVEL_PLANS', 'BUCKET_LIST', 'IDEAS', 'PROJECTS') NOT NULL,
  ADD COLUMN `coverStoredName` VARCHAR(191) NULL,
  ADD COLUMN `coverOriginalName` VARCHAR(191) NULL,
  ADD COLUMN `coverMimeType` VARCHAR(191) NULL,
  ADD COLUMN `coverSizeBytes` INTEGER NULL;

CREATE UNIQUE INDEX `LibraryItem_coverStoredName_key` ON `LibraryItem`(`coverStoredName`);
