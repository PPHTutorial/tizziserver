import type { User } from "@stall/db";

export const publicUser = (
  u: Pick<
    User,
    "id" | "phone" | "email" | "firstName" | "lastName" | "avatar" | "status" | "locale" | "username" | "emailVerifiedAt" | "phoneVerifiedAt"
  >,
) => ({
  id: u.id,
  phone: u.phone,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  avatar: u.avatar,
  status: u.status,
  locale: u.locale,
  username: u.username,
  emailVerifiedAt: u.emailVerifiedAt?.toISOString() ?? null,
  phoneVerifiedAt: u.phoneVerifiedAt?.toISOString() ?? null,
});

export const tokenResponse = (pair: {
  accessToken: string;
  refreshToken: string;
  activeRole: string;
  roles: string[];
  refreshExpiresAt: Date;
}) => ({
  accessToken: pair.accessToken,
  refreshToken: pair.refreshToken,
  activeRole: pair.activeRole,
  roles: pair.roles,
  refreshExpiresAt: pair.refreshExpiresAt.toISOString(),
});
