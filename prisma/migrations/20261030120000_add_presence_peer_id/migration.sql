-- AlterTable
ALTER TABLE "Presence" ADD COLUMN "peerId" TEXT;

-- CreateIndex
CREATE INDEX "Presence_peerId_idx" ON "Presence"("peerId");