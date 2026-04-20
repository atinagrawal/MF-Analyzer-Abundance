/**
 * auth.js — NextAuth v5 configuration
 *
 * Handles:
 *   - Google OAuth provider (only sign-in method for now)
 *   - @auth/pg-adapter for session + user persistence in Postgres
 *   - `role` field injected into the session from the DB users table
 *
 * Role values: 'client' | 'distributor' | 'admin'
 * Default on first sign-in: 'client'
 * Promotion to distributor/admin is done manually via the admin panel.
 *
 * Extensibility:
 *   - Adding email+password: add Credentials provider here
 *   - Adding magic links: add Resend/Nodemailer email provider here
 *   Both can be added without touching any other file.
 */

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import PostgresAdapter from '@auth/pg-adapter';
import pool from '@/lib/db';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(pool),

  providers: [
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],

  // Persist sessions in the DB (not JWT) so we can invalidate them server-side
  session: { strategy: 'database' },

  callbacks: {
    // Inject role into the session so every page/API can read it without a DB call
    async session({ session, user }) {
      if (session?.user) {
        session.user.id   = user.id;
        session.user.role = user.role ?? 'client';
      }
      return session;
    },
  },

  pages: {
    signIn: '/login',   // custom login page (app/login/page.jsx)
    error:  '/login',   // redirect auth errors to login page too
  },
});
