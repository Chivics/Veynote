ALTER TABLE `LibraryItem` ADD COLUMN `isFavorite` BOOLEAN NOT NULL DEFAULT false;

-- Earlier film records stored this choice inside the category properties.
UPDATE `LibraryItem`
SET `isFavorite` = true
WHERE `database` = 'FILMS'
  AND JSON_UNQUOTE(JSON_EXTRACT(`properties`, '$.favorite')) = 'true';

CREATE INDEX `LibraryItem_userId_isFavorite_deletedAt_idx`
ON `LibraryItem`(`userId`, `isFavorite`, `deletedAt`);
