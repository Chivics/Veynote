CREATE TABLE `WritingTemplate` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NOT NULL DEFAULT '',
  `category` VARCHAR(60) NOT NULL DEFAULT 'Personal',
  `content` LONGTEXT NOT NULL,
  `isTrashed` BOOLEAN NOT NULL DEFAULT false,
  `trashedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `WritingTemplate_userId_isTrashed_updatedAt_idx`(`userId`, `isTrashed`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `WritingTemplate`
  ADD CONSTRAINT `WritingTemplate_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
