CREATE TABLE `BusinessWorkspace` (
  `id` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(140) NOT NULL,
  `description` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `BusinessWorkspace_ownerId_idx`(`ownerId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BusinessMember` (
  `id` VARCHAR(191) NOT NULL,
  `workspaceId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `role` ENUM('OWNER','ADMIN','MANAGER','EDITOR','VIEWER') NOT NULL DEFAULT 'VIEWER',
  `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `BusinessMember_workspaceId_userId_key`(`workspaceId`, `userId`),
  INDEX `BusinessMember_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BusinessCustomer` (
  `id` VARCHAR(191) NOT NULL,
  `workspaceId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NULL,
  `name` VARCHAR(180) NOT NULL,
  `company` VARCHAR(180) NULL,
  `email` VARCHAR(254) NULL,
  `phone` VARCHAR(60) NULL,
  `source` VARCHAR(120) NULL,
  `stage` ENUM('LEAD','CONTACTED','QUALIFIED','CUSTOMER','INACTIVE') NOT NULL DEFAULT 'LEAD',
  `notes` TEXT NULL,
  `isArchived` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `BusinessCustomer_workspaceId_isArchived_stage_idx`(`workspaceId`, `isArchived`, `stage`),
  INDEX `BusinessCustomer_workspaceId_name_idx`(`workspaceId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BusinessInteraction` (
  `id` VARCHAR(191) NOT NULL,
  `workspaceId` VARCHAR(191) NOT NULL,
  `customerId` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(191) NULL,
  `actorName` VARCHAR(180) NOT NULL,
  `type` ENUM('NOTE','CALL','EMAIL','MEETING','OTHER') NOT NULL DEFAULT 'NOTE',
  `summary` TEXT NOT NULL,
  `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `nextActionAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `BusinessInteraction_workspaceId_occurredAt_idx`(`workspaceId`, `occurredAt`),
  INDEX `BusinessInteraction_customerId_occurredAt_idx`(`customerId`, `occurredAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BusinessOpportunity` (
  `id` VARCHAR(191) NOT NULL,
  `workspaceId` VARCHAR(191) NOT NULL,
  `customerId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NULL,
  `title` VARCHAR(180) NOT NULL,
  `amount` DECIMAL(18,2) NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'USD',
  `stage` ENUM('DISCOVERY','PROPOSAL','NEGOTIATION','WON','LOST') NOT NULL DEFAULT 'DISCOVERY',
  `expectedCloseAt` DATETIME(3) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `BusinessOpportunity_workspaceId_stage_idx`(`workspaceId`, `stage`),
  INDEX `BusinessOpportunity_customerId_idx`(`customerId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BusinessWorkspace` ADD CONSTRAINT `BusinessWorkspace_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BusinessMember` ADD CONSTRAINT `BusinessMember_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `BusinessWorkspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BusinessMember` ADD CONSTRAINT `BusinessMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BusinessCustomer` ADD CONSTRAINT `BusinessCustomer_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `BusinessWorkspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BusinessCustomer` ADD CONSTRAINT `BusinessCustomer_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `BusinessInteraction` ADD CONSTRAINT `BusinessInteraction_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `BusinessWorkspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BusinessInteraction` ADD CONSTRAINT `BusinessInteraction_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `BusinessCustomer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BusinessInteraction` ADD CONSTRAINT `BusinessInteraction_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `BusinessOpportunity` ADD CONSTRAINT `BusinessOpportunity_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `BusinessWorkspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BusinessOpportunity` ADD CONSTRAINT `BusinessOpportunity_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `BusinessCustomer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BusinessOpportunity` ADD CONSTRAINT `BusinessOpportunity_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
