type User = {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  isDisabled: boolean;
  isLdap: boolean;
  totpVerified: boolean;
  hasPassword: boolean;
  storageQuotaBytes?: string | null;
  shareCount?: number;
  reverseShareCount?: number;
};

export type CreateUser = {
  username: string;
  email: string;
  password?: string;
  isAdmin?: boolean;
  isDisabled?: boolean;
  storageQuotaBytes?: string | null;
};

export type UpdateUser = {
  username?: string;
  email?: string;
  password?: string;
  isAdmin?: boolean;
  isDisabled?: boolean;
  storageQuotaBytes?: string | null;
};

export type UpdateCurrentUser = {
  username?: string;
  email?: string;
};

export type TransferOwnershipSummary = {
  sourceUserId: string;
  shareCount: number;
  reverseShareCount: number;
  totalSizeBytes: string;
};

export type TransferOwnershipResult = {
  sourceUserId: string;
  targetUserId: string;
  sharesTransferred: number;
  reverseSharesTransferred: number;
  totalSizeBytes: string;
};

export type CurrentUser = User & {};

export type UserHook = {
  user: CurrentUser | null;
  refreshUser: () => Promise<CurrentUser | null>;
};

export default User;
