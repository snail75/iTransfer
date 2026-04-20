import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, Select, Switch } from "../../../components/ui";
import { ModalContextType } from "../../../contexts/ModalContext";
import useTranslate, {
  translateOutsideContext,
} from "../../../hooks/useTranslate.hook";
import userService from "../../../services/user.service";
import User, { TransferOwnershipSummary } from "../../../types/user.type";
import { byteToHumanSizeString } from "../../../utils/fileSize.util";
import toast from "../../../utils/toast.util";

const showTransferOwnershipModal = (
  modals: ModalContextType,
  user: User,
  users: User[],
  getUsers: () => void,
) => {
  const t = translateOutsideContext();
  return modals.openModal({
    title: t("admin.users.transfer.title", { username: user.username }),
    size: "lg",
    children: (
      <Body user={user} users={users} modals={modals} getUsers={getUsers} />
    ),
  });
};

const Body = ({
  user,
  users,
  modals,
  getUsers,
}: {
  user: User;
  users: User[];
  modals: ModalContextType;
  getUsers: () => void;
}) => {
  const t = useTranslate();
  const targetUsers = useMemo(
    () =>
      users.filter(
        (candidate) => candidate.id !== user.id && !candidate.isDisabled,
      ),
    [user.id, users],
  );
  const [targetUserId, setTargetUserId] = useState(targetUsers[0]?.id ?? "");
  const [includeReverseShares, setIncludeReverseShares] = useState(true);
  const [summary, setSummary] = useState<TransferOwnershipSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setIsLoadingSummary(true);
    userService
      .getTransferOwnershipSummary(user.id)
      .then(setSummary)
      .catch(toast.axiosError)
      .finally(() => setIsLoadingSummary(false));
  }, [user.id]);

  const transferSize = summary
    ? byteToHumanSizeString(Number(summary.totalSizeBytes))
    : "-";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!targetUserId) return;

    setIsSubmitting(true);
    userService
      .transferOwnership(user.id, targetUserId, includeReverseShares)
      .then((result) => {
        toast.success(
          t("admin.users.transfer.success", {
            shares: result.sharesTransferred,
            reverseShares: result.reverseSharesTransferred,
          }),
        );
        getUsers();
        modals.closeAll();
      })
      .catch(toast.axiosError)
      .finally(() => setIsSubmitting(false));
  };

  if (targetUsers.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t("admin.users.transfer.no-target")}
        </p>
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => modals.closeAll()}>
            {t("common.button.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Select
        label={t("admin.users.transfer.target-user")}
        value={targetUserId}
        onChange={(event) => setTargetUserId(event.target.value)}
        options={targetUsers.map((targetUser) => ({
          value: targetUser.id,
          label: `${targetUser.username} (${targetUser.email})`,
        }))}
      />

      <Switch
        label={t("admin.users.transfer.include-reverse-shares")}
        checked={includeReverseShares}
        onChange={setIncludeReverseShares}
      />

      <div className="rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-700">
        <h3 className="mb-3 font-medium text-text dark:text-text-dark">
          {t("admin.users.transfer.summary")}
        </h3>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-gray-500 dark:text-gray-400">
              {t("admin.users.transfer.summary.shares")}
            </dt>
            <dd className="font-medium text-text dark:text-text-dark">
              {isLoadingSummary ? "-" : (summary?.shareCount ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">
              {t("admin.users.transfer.summary.reverse-shares")}
            </dt>
            <dd className="font-medium text-text dark:text-text-dark">
              {isLoadingSummary
                ? "-"
                : includeReverseShares
                  ? (summary?.reverseShareCount ?? 0)
                  : 0}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">
              {t("admin.users.transfer.summary.size")}
            </dt>
            <dd className="font-medium text-text dark:text-text-dark">
              {isLoadingSummary ? "-" : transferSize}
            </dd>
          </div>
        </dl>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t("admin.users.transfer.warning")}
      </p>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          type="button"
          onClick={() => modals.closeAll()}
        >
          {t("common.button.cancel")}
        </Button>
        <Button type="submit" loading={isSubmitting} disabled={!targetUserId}>
          {t("admin.users.transfer.submit")}
        </Button>
      </div>
    </form>
  );
};

export default showTransferOwnershipModal;
