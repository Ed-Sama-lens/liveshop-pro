import NextAuth from 'next-auth';
import Facebook from 'next-auth/providers/facebook';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logging/logger';
import type { UserRole } from './types';

export const { handlers, auth, signIn, signOut } = NextAuth({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- version mismatch between @auth/prisma-adapter and @auth/core
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    Facebook({
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: '/auth/sign-in',
    error: '/auth/error',
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.id) return false;

      // Check if user is deactivated
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { isActive: true },
      });

      if (dbUser && !dbUser.isActive) {
        logger.warn({ userId: user.id }, '[Auth] Deactivated user attempted sign-in');
        return false;
      }

      // Write LoginEvent audit record
      try {
        await prisma.loginEvent.create({
          data: {
            userId: user.id,
            success: true,
          },
        });
      } catch (err) {
        logger.error({ err, userId: user.id }, '[Auth] Failed to write LoginEvent');
      }

      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        // First sign-in — populate token from DB user
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: {
            id: true,
            role: true,
            shopMembers: {
              select: { shopId: true },
              take: 1,
            },
          },
        });

        if (dbUser) {
          return {
            ...token,
            id: dbUser.id,
            role: dbUser.role,
            shopId: dbUser.shopMembers[0]?.shopId ?? null,
          };
        }
      }

      // Return new object — never mutate token
      return { ...token };
    },

    async session({ session, token }) {
      // Return new session object — immutable pattern
      return {
        ...session,
        user: {
          ...session.user,
          id: token.id as string,
          role: token.role as UserRole,
          shopId: token.shopId as string | null,
        },
      };
    },
  },
});
