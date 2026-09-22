-- Recipients per dispatch chunk. Null keeps using DISPATCH_BATCH_SIZE.
ALTER TABLE "campaigns" ADD COLUMN "batch_size" INTEGER;
