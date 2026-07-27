/*
  Warnings:

  - A unique constraint covering the columns `[transfiUserId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN "transfiUserId" TEXT;

-- CreateTable
CREATE TABLE "transfi_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "orderType" TEXT NOT NULL DEFAULT 'ONRAMP',
    "provider" TEXT NOT NULL DEFAULT 'TRANSFI',
    "providerOrderId" TEXT,
    "providerTraceId" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentType" TEXT,
    "paymentCode" TEXT,
    "crypto" TEXT NOT NULL DEFAULT 'USDCBASE',
    "cryptoNetwork" TEXT NOT NULL DEFAULT 'Base',
    "cryptoAmount" REAL,
    "walletAddress" TEXT NOT NULL,
    "walletOwner" TEXT,
    "successRedirectUrl" TEXT,
    "failureRedirectUrl" TEXT,
    "payUrl" TEXT,
    "payToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fee" REAL,
    "rawResponse" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "transfi_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "transfi_orders_providerOrderId_key" ON "transfi_orders"("providerOrderId");

-- CreateIndex
CREATE INDEX "transfi_orders_userId_idx" ON "transfi_orders"("userId");

-- CreateIndex
CREATE INDEX "transfi_orders_status_idx" ON "transfi_orders"("status");

-- CreateIndex
CREATE INDEX "transfi_orders_providerOrderId_idx" ON "transfi_orders"("providerOrderId");

-- CreateIndex
CREATE INDEX "transfi_orders_createdAt_idx" ON "transfi_orders"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_transfiUserId_key" ON "User"("transfiUserId");
