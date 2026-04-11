type User = {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  isLdap: boolean;
  totpVerified: boolean;
  hasPassword: boolean;
  storageQuotaBytes?: string | null;
};

export type CreateUser = {
  username: string;
  email: string;
  password?: string;
  isAdmin?: boolean;
  storageQuotaBytes?: string | null;
};

export type UpdateUser = {
  username?: string;
  email?: string;
  password?: string;
  isAdmin?: boolean;
  storageQuotaBytes?: string | null;
};

export type UpdateCurrentUser = {
  username?: string;
  email?: string;
};

export type CurrentUser = User & {};

export type UserHook = {
  user: CurrentUser | null;
  refreshUser: () => Promise<CurrentUser | null>;
};

export default User;
