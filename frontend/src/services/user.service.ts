import {
  CreateUser,
  CurrentUser,
  TransferOwnershipResult,
  TransferOwnershipSummary,
  UpdateCurrentUser,
  UpdateUser,
} from "../types/user.type";
import api from "./api.service";
import authService from "./auth.service";

const list = async () => {
  return (await api.get("/users")).data;
};

const create = async (user: CreateUser) => {
  return (await api.post("/users", user)).data;
};

const update = async (id: string, user: UpdateUser) => {
  return (await api.patch(`/users/${id}`, user)).data;
};

const remove = async (id: string) => {
  await api.delete(`/users/${id}`);
};

const getTransferOwnershipSummary = async (
  id: string,
): Promise<TransferOwnershipSummary> => {
  return (await api.get(`/users/${id}/transfer-ownership/summary`)).data;
};

const transferOwnership = async (
  id: string,
  targetUserId: string,
  includeReverseShares: boolean,
): Promise<TransferOwnershipResult> => {
  return (
    await api.post(`/users/${id}/transfer-ownership`, {
      targetUserId,
      includeReverseShares,
    })
  ).data;
};

const updateCurrentUser = async (user: UpdateCurrentUser) => {
  return (await api.patch("/users/me", user)).data;
};

const removeCurrentUser = async () => {
  await api.delete("/users/me");
};

const getCurrentUser = async (): Promise<CurrentUser | null> => {
  try {
    await authService.refreshAccessToken();
    return (await api.get("users/me")).data;
  } catch {
    return null;
  }
};

export default {
  list,
  create,
  update,
  remove,
  getTransferOwnershipSummary,
  transferOwnership,
  getCurrentUser,
  updateCurrentUser,
  removeCurrentUser,
};
