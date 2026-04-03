import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/auth';
import { FacebookSignInButton } from '@/components/shared/FacebookSignInButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">LiveShop Pro</CardTitle>
          <CardDescription>Sign in to manage your live shop</CardDescription>
        </CardHeader>
        <CardContent>
          <FacebookSignInButton />
        </CardContent>
      </Card>
    </main>
  );
}
