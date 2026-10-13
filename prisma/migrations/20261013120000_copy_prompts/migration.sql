-- CreateTable
CREATE TABLE "CopyPrompt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instruction" TEXT NOT NULL,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopyPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CopyPrompt_key_key" ON "CopyPrompt"("key");

-- CreateIndex
CREATE INDEX "CopyPrompt_enabled_sortOrder_idx" ON "CopyPrompt"("enabled", "sortOrder");
