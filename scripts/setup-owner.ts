import { prisma } from '../src/lib/db/prisma';

async function main() {
  const userId = 'cmnlg08ih000104l8sgnceesl';

  // Create shop
  const shop = await prisma.shop.create({
    data: {
      name: 'Nazha Hatyai',
      defaultCurrency: 'THB',
    },
  });
  console.log('Shop created:', shop.id, shop.name);

  // Update user role to OWNER
  await prisma.user.update({
    where: { id: userId },
    data: { role: 'OWNER' },
  });
  console.log('User role updated to OWNER');

  // Create shop member
  await prisma.shopMember.create({
    data: {
      userId,
      shopId: shop.id,
      role: 'OWNER',
    },
  });
  console.log('ShopMember created');

  // Verify
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, shopMembers: { select: { shopId: true, role: true } } },
  });
  console.log('Final user:', JSON.stringify(user, null, 2));

  await prisma.$disconnect();
}
main();
