ALTER TABLE `FileNode`
  ADD COLUMN `uploadSessionId` VARCHAR(40) NULL,
  ADD UNIQUE INDEX `FileNode_uploadSessionId_key` (`uploadSessionId`);
