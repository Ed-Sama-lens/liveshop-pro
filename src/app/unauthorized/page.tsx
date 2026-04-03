import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-6 text-center">
        <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
        <p className="text-muted-foreground text-sm">
          You do not have permission to view this page.
          Contact your shop owner if you believe this is an error.
        </p>
        <Button render={<Link href="/dashboard" />} variant="outline" className="w-full">
          Go to Dashboard
        </Button>
      </div>
    </main>
  );
}
