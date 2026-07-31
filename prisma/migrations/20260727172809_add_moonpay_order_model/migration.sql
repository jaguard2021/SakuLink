-- CreateTable
CREATE TABLE "moonpay_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "moonPayTransactionId" TEXT NOT NULL,
    "eventType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fiatCurrency" TEXT NOT NULL DEFAULT 'USD',
    "fiatAmount" REAL NOT NULL,
    "cryptoCurrency" TEXT NOT NULL DEFAULT 'USDC',
    "cryptoNetwork" TEXT NOT NULL DEFAULT 'ARC-TESTNET',
    "cryptoAmount" REAL,
    "walletAddress" TEXT NOT NULL,
    "transactionHash" TEXT,
    "widgetRedirectUrl" TEXT,
    "feeAmount" REAL,
    "networkFeeAmount" REAL,
    "rawResponse" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "moonpay_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "moonpay_orders_moonPayTransactionId_key" ON "moonpay_orders"("moonPayTransactionId");

-- CreateIndex
CREATE INDEX "moonpay_orders_userId_idx" ON "moonpay_orders"("userId");

-- CreateIndex
CREATE INDEX "moonpay_orders_status_idx" ON "moonpay_orders"("status");

-- CreateIndex
CREATE INDEX "moonpay_orders_moonPayTransactionId_idx" ON "moonpay_orders"("moonPayTransactionId");

-- CreateIndex
CREATE INDEX "moonpay_orders_createdAt_idx" ON "moonpay_orders"("createdAt");
