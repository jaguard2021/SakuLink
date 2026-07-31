/*
  Warnings:

  - You are about to drop the `moonpay_orders` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "moonpay_orders";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "OnRampTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "usdcAmount" REAL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "step" TEXT,
    "circleMintId" TEXT,
    "circleTransferId" TEXT,
    "walletAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnRampTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "OnRampTransaction_userId_idx" ON "OnRampTransaction"("userId");

-- CreateIndex
CREATE INDEX "OnRampTransaction_status_idx" ON "OnRampTransaction"("status");
