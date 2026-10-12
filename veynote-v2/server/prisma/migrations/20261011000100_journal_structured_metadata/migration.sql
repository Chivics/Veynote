ALTER TABLE `Note`
  ADD COLUMN `journalType` VARCHAR(40) NULL,
  ADD COLUMN `journalData` JSON NULL;

CREATE INDEX `Note_userId_kind_journalType_entryDate_idx`
  ON `Note`(`userId`, `kind`, `journalType`, `entryDate`);

UPDATE `Note` n JOIN `NoteTag` nt ON nt.`noteId`=n.`id` JOIN `Tag` t ON t.`id`=nt.`tagId` SET n.`journalType`='decision' WHERE n.`kind`='JOURNAL' AND t.`name`='journal:decision';
UPDATE `Note` n JOIN `NoteTag` nt ON nt.`noteId`=n.`id` JOIN `Tag` t ON t.`id`=nt.`tagId` SET n.`journalType`='calibration' WHERE n.`kind`='JOURNAL' AND t.`name`='journal:calibration';
UPDATE `Note` n JOIN `NoteTag` nt ON nt.`noteId`=n.`id` JOIN `Tag` t ON t.`id`=nt.`tagId` SET n.`journalType`='reflection' WHERE n.`kind`='JOURNAL' AND t.`name`='journal:reflection';
UPDATE `Note` n JOIN `NoteTag` nt ON nt.`noteId`=n.`id` JOIN `Tag` t ON t.`id`=nt.`tagId` SET n.`journalType`='mood' WHERE n.`kind`='JOURNAL' AND t.`name`='journal:mood';
UPDATE `Note` n JOIN `NoteTag` nt ON nt.`noteId`=n.`id` JOIN `Tag` t ON t.`id`=nt.`tagId` SET n.`journalType`='lesson' WHERE n.`kind`='JOURNAL' AND t.`name`='journal:lesson';
UPDATE `Note` n JOIN `NoteTag` nt ON nt.`noteId`=n.`id` JOIN `Tag` t ON t.`id`=nt.`tagId` SET n.`journalType`='weekly' WHERE n.`kind`='JOURNAL' AND t.`name`='review:weekly';
UPDATE `Note` n JOIN `NoteTag` nt ON nt.`noteId`=n.`id` JOIN `Tag` t ON t.`id`=nt.`tagId` SET n.`journalType`='monthly' WHERE n.`kind`='JOURNAL' AND t.`name`='review:monthly';
UPDATE `Note` n JOIN `NoteTag` nt ON nt.`noteId`=n.`id` JOIN `Tag` t ON t.`id`=nt.`tagId` SET n.`journalType`='quarterly' WHERE n.`kind`='JOURNAL' AND t.`name`='review:quarterly';
UPDATE `Note` n JOIN `NoteTag` nt ON nt.`noteId`=n.`id` JOIN `Tag` t ON t.`id`=nt.`tagId` SET n.`journalType`='annual' WHERE n.`kind`='JOURNAL' AND t.`name`='review:annual';

UPDATE `Note` SET `journalType` = 'daily'
WHERE `kind` = 'JOURNAL' AND `journalType` IS NULL;
