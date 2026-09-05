/*
  Warnings:

  - A unique constraint covering the columns `[shareToken]` on the table `Note` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `folder` MODIFY `icon` VARCHAR(191) NOT NULL DEFAULT '📁';

-- AlterTable
ALTER TABLE `note` ADD COLUMN `shareEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `shareToken` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Note_shareToken_key` ON `Note`(`shareToken`);
