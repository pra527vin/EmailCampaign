-- Restricts a campaign to CSV rows [start, end] of its list. Both null means
-- the whole list.
ALTER TABLE "campaigns" ADD COLUMN "recipient_range_start" INTEGER;
ALTER TABLE "campaigns" ADD COLUMN "recipient_range_end" INTEGER;

-- Backs the recipient-range filter (listId + rowNumber range scan).
CREATE INDEX "recipients_list_id_row_number_idx" ON "recipients"("list_id", "row_number");
