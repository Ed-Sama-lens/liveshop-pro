import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AuthErrorPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-destructive">Sign In Failed</CardTitle>
          <CardDescription>
            Something went wrong during authentication. Please try again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button render={<Link href="/auth/sign-in" />} className="w-full">
            Try again
          </Button>
          <Button render={<Link href="/dashboard" />} variant="outline" className="w-full">
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
