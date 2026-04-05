import NextAuth from 'next-auth';
import Facebook from 'next-auth/providers/facebook';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
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
    Credentials({
      name: 'credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const username = credentials?.username as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!username || !password) return null;

        const user = await prisma.user.findUnique({
          where: { username },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            isActive: true,
            hashedPassword: true,
          },
        });

        if (!user || !user.hashedPassword) return null;
        if (!user.isActive) return null;

        const isValid = await bcrypt.compare(password, user.hashedPassword);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
        };
      },
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

      // Skip DB check for credentials provider (already checked in authorize)
      if (account?.provider === 'credentials') {
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
      }

      // Check if user is deactivated (Facebook login)
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
