import type { UserRole } from '@/generated/prisma';

export type { UserRole };

export interface SessionUser {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly image: string | null;
  readonly role: UserRole;
  readonly shopId: string | null;
}

declare module 'next-auth' {
  interface Session {
    user: SessionUser;
  }

  interface User {
    role: UserRole;
    shopId?: string | null;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id: string;
    role: UserRole;
    shopId: string | null;
  }
}
