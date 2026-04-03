import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/auth';
import { Sidebar } from '@/components/shared/Sidebar';
import { Header } from '@/components/shared/Header';
import type { SessionUser } from '@/lib/auth/types';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect('/auth/sign-in');
  }

  const user = session.user as SessionUser;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar userRole={user.role} />
      <div className="lg:pl-64">
        <Header user={user} />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
