/*
  Warnings:

  - A unique constraint covering the columns `[providerOrderId]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "provider" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "providerOrderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_providerOrderId_key" ON "Transaction"("providerOrderId");
