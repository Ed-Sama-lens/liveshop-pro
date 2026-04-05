import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/auth';
import { FacebookSignInButton } from '@/components/shared/FacebookSignInButton';
import { CredentialsSignInForm } from '@/components/shared/CredentialsSignInForm';
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
        <CardContent className="space-y-6">
          {/* Username / Password Login */}
          <CredentialsSignInForm />

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          {/* Facebook Login */}
          <FacebookSignInButton />
        </CardContent>
      </Card>
    </main>
  );
}
