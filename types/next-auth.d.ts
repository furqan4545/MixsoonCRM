import "next-auth";

declare module "next-auth" {
  interface User {
    id?: string;
    status?: string;
    role?: string;
    permissions?: { feature: string; action: string }[];
  }

  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      status?: string;
      role?: string;
      permissions?: { feature: string; action: string }[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    status?: string;
    role?: string;
    permissions?: { feature: string; action: string }[];
  }
}
