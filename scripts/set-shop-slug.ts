import { prisma } from '../src/lib/db/prisma';

async function main() {
  const shop = await prisma.shop.update({
    where: { id: 'cmnlgab7v00008wuk7bx7ecuc' },
    data: { slug: 'nazha-hatyai' },
    select: { id: true, name: true, slug: true },
  });
  console.log('Updated:', shop);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
