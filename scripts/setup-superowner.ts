import { prisma } from '../src/lib/db/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  const userId = 'cmnlg08ih000104l8sgnceesl'; // Warut Thaworn
  const username = 'SuperOwner';
  const password = 'NazhaHatyai12345678';

  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { id: userId },
    data: {
      username,
      hashedPassword,
    },
  });

  console.log('SuperOwner credentials set!');
  console.log('Username:', username);
  console.log('Password hash created successfully');

  // Verify
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, username: true, role: true, hashedPassword: true },
  });
  console.log('User:', { ...user, hashedPassword: user?.hashedPassword ? '***SET***' : 'NOT SET' });

  await prisma.$disconnect();
}
main();
