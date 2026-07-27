const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Ambil user pertama yang ada di database (misal: Budi TKI)
  const existingUser = await prisma.user.findFirst();

  if (!existingUser) {
    console.log('❌ Belum ada user di database. Silakan buat user via register aplikasi terlebih dahulu.');
    return;
  }

  // Buat dompet treasury yang dihubungkan ke user tersebut
  await prisma.wallet.create({
    data: {
      circleWalletId: '5b0ec2f2-f8fb-5828-ba53-f6494a3c2444',
      address: '0x1234567890abcdef1234567890abcdef12345678',
      network: 'BASE-SEPOLIA',
      userId: existingUser.id
    }
  });

  console.log('Treasury wallet berhasil ditambahkan dan dihubungkan ke user:', existingUser.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());