import { prisma } from '../src/lib/db/prisma';

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, isActive: true, shopMembers: { select: { shopId: true } } }
  });
  console.log('Users:', JSON.stringify(users, null, 2));

  const shops = await prisma.shop.findMany();
  console.log('Shops:', JSON.stringify(shops, null, 2));

  await prisma.$disconnect();
}
main();
