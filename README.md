# SakuLink

## Automated Programmable Remittance Platform for Migrant Workers

## Introduction

SakuLink is an automated remittance platform built on the Arc Network that harnesses the power of Programmable Money to provide a transparent, rule-based financial bridge for migrant workers.

We are not changing the way migrant workers support their families. They can still send money as usual, but with unprecedented control, automation, and reliability.

Rather than relying solely on manual, one-time transfers, SakuLink unlocks automated financial workflows through Circle’s Developer Services and Programmable Wallets.

Migrant workers can easily program their funds, such as:

- Scheduling recurring family allowances
- Securing time-locked savings for returning home
- Automating local utility bill payments (PLN, BPJS) directly upon arrival

For final execution, SakuLink seamlessly connects digital assets to local Indonesian banking rails and popular e-wallets like DANA, GoPay, and OVO through an efficient offramp process.

SakuLink is not a competitor to traditional remittance services. We complement existing habits by leveraging the advantages of Circle, USDC, and the Arc Network, bringing automated financial rules, complete transparency, and robust reliability without disrupting the familiar routines migrant workers already trust.

---

# Problem

Millions of migrant workers regularly send money back home to support their families. However, traditional remittance systems still have several limitations:

- Manual transfers require repeated actions every month
- Family support depends on the sender remembering payment schedules
- Savings goals are difficult to automate
- Users have limited visibility and control over their funds after sending
- Cross-border payment processes involve multiple intermediaries

SakuLink addresses these challenges by introducing programmable financial automation.

---

# Solution

SakuLink transforms remittance from a simple transfer activity into an automated financial workflow.

Using programmable wallets and smart financial rules, users can define how their money should behave:

```
"I want to send my family allowance every month."

"I want to lock savings until I return home."

"I want my electricity bill to be paid automatically."
```

Once rules are created, SakuLink's Automation Agent executes these instructions securely.

---

# How SakuLink Works

```
Migrant Worker
      |
      |
      v
Fiat Payment
(HitPay / TransFi)
      |
      |
      v
Circle Programmable Wallet
      |
      |
      v
USDC on Arc Network
      |
      |
      v
Automation Agent
      |
      |
      v
BridgeKit
(Arc → Base)
      |
      |
      v
TransFi Off-Ramp
      |
      |
      v
Indonesian Bank / E-Wallet
(BCA, BNI, BRI, DANA, GoPay, OVO)
```

---

# Core Features

## 1. Programmable Remittance Rules

Users can create automated financial instructions:

- Monthly family allowance
- Weekly transfers
- Scheduled savings
- Automated payments

Powered by SakuLink Rule Engine.

---

## 2. Circle Programmable Wallets

SakuLink uses Circle Developer Services to provide:

- Developer-controlled wallets
- Secure USDC management
- Wallet abstraction
- Blockchain-based transaction transparency

Each user receives a dedicated programmable wallet.

---

## 3. Automation Agent

SakuLink includes an automation engine that:

- Checks active financial rules
- Validates wallet balance
- Monitors exchange rate conditions
- Requests confirmation when risk conditions occur
- Executes scheduled transfers automatically

---

## 4. USDC Powered Settlement

SakuLink uses USDC as the settlement layer:

Benefits:

- Stable value
- Transparent transactions
- Fast blockchain settlement
- Cross-border compatibility

---

## 5. Cross-Chain Infrastructure

SakuLink utilizes Circle BridgeKit to move USDC between networks:

```
Arc Testnet
     |
     |
     v
Base Sepolia
```

This allows efficient integration with external financial services.

---

## 6. Local Indonesian Off-Ramp

After blockchain settlement, SakuLink connects digital assets with local payment rails:

Supported destinations:

- Indonesian bank accounts
- DANA
- GoPay
- OVO
- Other local payment providers

---

# Architecture

## Backend

```
Node.js
    |
Express API
    |
Prisma ORM
    |
SQLite Database
```

## Blockchain Layer

```
Arc Network
    |
Circle Developer Controlled Wallets
    |
USDC
    |
Circle BridgeKit
    |
Base Network
```

## Payment Layer

```
Fiat On-Ramp
    |
HitPay
    |
TransFi

Crypto Settlement
    |
USDC

Fiat Off-Ramp
    |
TransFi
```

---

# Technology Stack

## Blockchain

- Arc Network
- USDC
- Circle Developer Services
- Circle Programmable Wallets
- Circle BridgeKit

## Backend

- Node.js
- Express.js
- TypeScript
- Prisma ORM

## Database

- SQLite (Hackathon Environment)

## Payment Infrastructure

- HitPay Sandbox
- TransFi Sandbox

## Exchange Rate

- ExchangeRate API

---

# Project Structure

```
SakuLink/

├── prisma/
│   ├── schema.prisma
│   └── migrations/

├── src/
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   ├── middlewares/
│   └── scheduler.ts

├── seed-treasury.js
├── package.json
├── tsconfig.json
└── README.md
```

---

# Environment Setup

## Requirements

- Node.js >= 20
- npm
- Git

---

## Installation

Clone repository:

```bash
git clone https://github.com/jaguard2021/SakuLink.git

cd SakuLink
```

Install dependencies:

```bash
npm install
```

Create environment file:

```bash
cp .env.example .env
```

Configure required API keys:

- Circle
- TransFi
- HitPay
- Exchange Rate API

---

## Database Setup

Generate Prisma client:

```bash
npx prisma generate
```

Run migration:

```bash
npx prisma migrate dev
```

---

## Run Development Server

```bash
npm run dev
```

Server default:

```
http://localhost:3000
```

---

# Hackathon Demo Flow

1. User registers account
2. Circle wallet is automatically created
3. User deposits fiat currency
4. Fiat is converted into USDC
5. USDC is stored in programmable wallet
6. User creates automation rules
7. Automation Agent executes scheduled transactions
8. USDC moves through Arc Network
9. BridgeKit transfers assets to Base
10. Off-ramp service delivers funds to Indonesian payment rails

---

# Security Considerations

SakuLink follows secure development practices:

- Environment-based secret management
- JWT authentication
- Developer-controlled wallet infrastructure
- Transaction status tracking
- Rule execution validation

---

# Vision

SakuLink aims to create a future where migrant workers do not only send money, but can program how their money supports their families.

By combining programmable money, stablecoins, and local financial infrastructure, SakuLink creates a smarter, more reliable, and automated remittance experience.

---

# Built With

❤️ Circle Developer Services  
🌐 Arc Network  
💵 USDC  
🔗 TransFi  
💳 HitPay  
⚡ Programmable Money