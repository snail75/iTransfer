import { useEffect, useState } from "react";
import { TbPlus } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import Meta from "../../components/Meta";
import ManageUserTable from "../../components/admin/users/ManageUserTable";
import showCreateUserModal from "../../components/admin/users/showCreateUserModal";
import useConfig from "../../hooks/config.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import userService from "../../services/user.service";
import User from "../../types/user.type";
import toast from "../../utils/toast.util";
import { Button, Container } from "../../components/ui";
import { useModals } from "../../contexts/ModalContext";

const Users = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const config = useConfig();
  const modals = useModals();
  const t = useTranslate();

  const getUsers = () => {
    setIsLoading(true);
    userService.list().then((users) => {
      setUsers(users);
      setIsLoading(false);
    });
  };

  const deleteUser = (user: User) => {
    const ownedTransferCount =
      (user.shareCount ?? 0) + (user.reverseShareCount ?? 0);

    modals.openConfirmModal({
      title: t("admin.users.edit.delete.title", {
        username: user.username,
      }),
      children: (
        <div className="space-y-3 text-sm">
          <p>
            <FormattedMessage id="admin.users.edit.delete.description" />
          </p>
          {ownedTransferCount > 0 && (
            <p className="text-red-600 dark:text-red-400">
              {t("admin.users.transfer.delete-warning", {
                count: ownedTransferCount,
              })}
            </p>
          )}
        </div>
      ),
      labels: {
        confirm: t("common.button.delete"),
        cancel: t("common.button.cancel"),
      },
      confirmProps: { variant: "danger" },
      onConfirm: async () => {
        userService
          .remove(user.id)
          .then(() => setUsers(users.filter((v) => v.id != user.id)))
          .catch(toast.axiosError);
      },
    });
  };

  const toggleUserDisabled = (user: User) => {
    const nextIsDisabled = !user.isDisabled;

    modals.openConfirmModal({
      title: t(
        nextIsDisabled
          ? "admin.users.disable.title"
          : "admin.users.enable.title",
        {
          username: user.username,
        },
      ),
      children: (
        <p className="text-sm">
          <FormattedMessage
            id={
              nextIsDisabled
                ? "admin.users.disable.description"
                : "admin.users.enable.description"
            }
          />
        </p>
      ),
      labels: {
        confirm: t(
          nextIsDisabled
            ? "admin.users.action.disable"
            : "admin.users.action.enable",
        ),
        cancel: t("common.button.cancel"),
      },
      confirmProps: { variant: nextIsDisabled ? "danger" : "primary" },
      onConfirm: async () => {
        userService
          .update(user.id, { isDisabled: nextIsDisabled })
          .then(getUsers)
          .catch(toast.axiosError);
      },
    });
  };

  useEffect(() => {
    getUsers();
  }, []);

  return (
    <>
      <Meta title={t("admin.users.title")} />
      <Container>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-baseline gap-4 mb-5">
          <h2 className="text-2xl font-bold text-text dark:text-text-dark">
            <FormattedMessage id="admin.users.title" />
          </h2>
          <Button
            onClick={() =>
              showCreateUserModal(modals, config.get("smtp.enabled"), getUsers)
            }
          >
            <TbPlus className="mr-2" size={18} />
            <FormattedMessage id="common.button.create" />
          </Button>
        </div>

        <ManageUserTable
          users={users}
          getUsers={getUsers}
          deleteUser={deleteUser}
          toggleUserDisabled={toggleUserDisabled}
          isLoading={isLoading}
        />
      </Container>
    </>
  );
};

export default Users;
