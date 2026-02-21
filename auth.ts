import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const raw = credentials ?? {};
        const email = raw.email != null ? String(raw.email).toLowerCase().trim() : "";
        const password = raw.password;
        if (!email || typeof password !== "string") {
          console.error("[auth] authorize: missing email or password. Keys received:", Object.keys(raw));
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            role: {
              include: { permissions: true },
            },
          },
        });

        if (!user) {
          console.error("[auth] authorize: user not found", email);
          return null;
        }
        if (!user.passwordHash || user.passwordHash.startsWith("$2a$12$MIGRATION_PLACEHOLDER")) {
          console.error("[auth] authorize: invalid password hash (run: npm run db:seed)");
          return null;
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          console.error("[auth] authorize: password mismatch for", email);
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          status: user.status,
          role: user.role.name,
          permissions: user.role.permissions.map((p) => ({
            feature: p.feature,
            action: p.action,
          })),
        };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.status = user.status;
        token.role = user.role;
        token.permissions = user.permissions;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.status = token.status as string;
        session.user.role = token.role as string;
        session.user.permissions = (token.permissions ?? []) as {
          feature: string;
          action: string;
        }[];
      }
      return session;
    },
  },
});
