ALTER TABLE `Note`
  ADD COLUMN `contentPreview` VARCHAR(512) NOT NULL DEFAULT '',
  ADD COLUMN `wordCount` INTEGER NOT NULL DEFAULT 0;

-- Backfill existing writing at migration time so collections remain useful
-- immediately. Subsequent saves use the richer server-side HTML text parser.
UPDATE `Note`
SET `contentPreview` = LEFT(TRIM(REGEXP_REPLACE(
      REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        REGEXP_REPLACE(`content`, '<[^>]*>', ' '),
        '&nbsp;', ' '), '&amp;', '&'), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'),
      '[[:space:]]+', ' ')), 512),
    `wordCount` = CASE
      WHEN TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(`content`, '<[^>]*>', ' '), '&[^;[:space:]]+;', ' '), '[^[:alnum:]]+', ' ')) = '' THEN 0
      ELSE 1 + CHAR_LENGTH(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(`content`, '<[^>]*>', ' '), '&[^;[:space:]]+;', ' '), '[^[:alnum:]]+', ' ')))
             - CHAR_LENGTH(REPLACE(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(`content`, '<[^>]*>', ' '), '&[^;[:space:]]+;', ' '), '[^[:alnum:]]+', ' ')), ' ', ''))
    END;
