import { useModals } from "../../contexts/ModalContext";
import { useClipboard } from "../../hooks/useClipboard";
import moment from "moment";
import Link from "next/link";
import { useMemo, useEffect, useState } from "react";
import { TbEdit, TbInfoCircle, TbLink, TbLock, TbTrash } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import Meta from "../../components/Meta";
import showShareInformationsModal from "../../components/account/showShareInformationsModal";
import showShareLinkModal from "../../components/account/showShareLinkModal";
import CenterLoader from "../../components/core/CenterLoader";
import TableSortIcon, { TableSort } from "../../components/core/SortIcon";
import useConfig from "../../hooks/config.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import shareService from "../../services/share.service";
import { MyShare } from "../../types/share.type";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import toast from "../../utils/toast.util";
import { Button, Checkbox, Container, Input, Table } from "../../components/ui";

const MyShares = () => {
  const modals = useModals();
  const clipboard = useClipboard();
  const config = useConfig();
  const t = useTranslate();

  const [shares, setShares] = useState<MyShare[]>();
  const [query, setQuery] = useState("");
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<TableSort>({
    property: "createdAt",
    direction: "desc",
  });

  useEffect(() => {
    shareService.getMyShares().then((shares) => {
      setShares(shares);
      setEditingNames(
        Object.fromEntries(
          shares.map((share) => [share.id, share.name || share.id]),
        ),
      );
    });
  }, []);

  const filteredShares = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!shares || !needle) return shares;
    return shares.filter((share) =>
      [
        share.id,
        share.name,
        share.files?.map((file: { name: string }) => file.name).join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [shares, query]);

  const sortedShares = useMemo(() => {
    if (!filteredShares || !sort.property) return filteredShares;

    return [...filteredShares].sort((firstShare, secondShare) => {
      const firstValue = getSortValue(firstShare, sort.property!);
      const secondValue = getSortValue(secondShare, sort.property!);
      const direction = sort.direction === "asc" ? 1 : -1;

      if (typeof firstValue === "number" && typeof secondValue === "number") {
        return (firstValue - secondValue) * direction;
      }

      return (
        firstValue
          .toString()
          .localeCompare(secondValue.toString(), undefined, { numeric: true }) *
        direction
      );
    });
  }, [filteredShares, sort]);

  const updateShareFlag = (
    shareId: string,
    key: "allowPublicUpload" | "allowVersioning",
    value: boolean,
  ) => {
    const update =
      key === "allowPublicUpload"
        ? shareService.updatePublicUpload
        : shareService.updateVersioning;

    update(shareId, value)
      .then((updatedShare) => {
        setShares(
          shares?.map((item) =>
            item.id === shareId ? { ...item, [key]: updatedShare[key] } : item,
          ),
        );
        toast.success("Saved");
      })
      .catch(toast.axiosError);
  };

  const saveShareName = (share: MyShare) => {
    const name = editingNames[share.id]?.trim();
    shareService
      .updateName(share.id, name)
      .then((updatedShare) => {
        setShares(
          shares?.map((item) =>
            item.id === share.id ? { ...item, name: updatedShare.name } : item,
          ),
        );
        toast.success(t("account.shares.notify.name-saved"));
      })
      .catch(toast.axiosError);
  };

  const openShareInformation = (share: MyShare) => {
    showShareInformationsModal(
      modals,
      share,
      parseInt(config.get("share.maxSize")),
    );
  };

  const copyShareLink = (share: MyShare) => {
    if (typeof window !== "undefined" && window.isSecureContext) {
      clipboard.copy(`${window.location.origin}/s/${share.id}`);
      toast.success(t("common.notify.copied-link"));
    } else {
      showShareLinkModal(modals, share.id);
    }
  };

  const confirmDeleteShare = (share: MyShare) => {
    modals.openConfirmModal({
      title: t("account.shares.modal.delete.title", {
        share: share.id,
      }),
      children: (
        <p className="text-sm">
          <FormattedMessage id="account.shares.modal.delete.description" />
        </p>
      ),
      confirmProps: {
        variant: "danger",
      },
      labels: {
        confirm: t("common.button.delete"),
        cancel: t("common.button.cancel"),
      },
      onConfirm: () => {
        shareService.remove(share.id);
        setShares(shares?.filter((item) => item.id !== share.id));
      },
    });
  };

  if (!shares) return <CenterLoader />;

  return (
    <>
      <Meta title={t("account.shares.title")} />
      <Container>
        <h2 className="text-2xl font-bold mb-8 text-text dark:text-text-dark">
          <FormattedMessage id="account.shares.title" />
        </h2>
        <div className="mb-4 max-w-md">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search links"
          />
        </div>
        {shares.length == 0 ? (
          <div
            className="flex flex-col items-center justify-center"
            style={{ height: "70vh" }}
          >
            <h3 className="text-xl font-bold mb-2 text-text dark:text-text-dark">
              <FormattedMessage id="account.shares.title.empty" />
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              <FormattedMessage id="account.shares.description.empty" />
            </p>
            <Button as={Link} href="/upload" variant="outline">
              <FormattedMessage id="account.shares.button.create" />
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-4 md:hidden">
              {sortedShares!.map((share) => (
                <article
                  key={share.id}
                  className="border-b border-gray-200 py-4 dark:border-gray-700"
                >
                  <div className="flex min-w-0 flex-col gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <Input
                          maxLength={128}
                          value={
                            editingNames[share.id] ?? share.name ?? share.id
                          }
                          onChange={(event) =>
                            setEditingNames({
                              ...editingNames,
                              [share.id]: event.target.value,
                            })
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => saveShareName(share)}
                      >
                        {t("common.button.save")}
                      </Button>
                    </div>

                    <div className="grid gap-2 text-sm text-text dark:text-text-dark">
                      <Checkbox
                        label={t("account.shares.table.allow-uploads")}
                        checked={share.allowPublicUpload}
                        onChange={(event) =>
                          updateShareFlag(
                            share.id,
                            "allowPublicUpload",
                            event.target.checked,
                          )
                        }
                      />
                      <Checkbox
                        label={t("account.shares.table.allow-versioning")}
                        checked={share.allowVersioning}
                        onChange={(event) =>
                          updateShareFlag(
                            share.id,
                            "allowVersioning",
                            event.target.checked,
                          )
                        }
                      />
                    </div>

                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                      <dt className="font-medium text-gray-500 dark:text-gray-400">
                        <FormattedMessage id="account.shares.table.expiresAt" />
                      </dt>
                      <dd className="text-right text-text dark:text-text-dark">
                        {moment(share.expiration).unix() === 0 ? (
                          <FormattedMessage id="account.shares.table.expiry-never" />
                        ) : (
                          formatShareDate(share.expiration)
                        )}
                      </dd>
                      <dt className="font-medium text-gray-500 dark:text-gray-400">
                        <FormattedMessage id="account.shares.table.createdAt" />
                      </dt>
                      <dd className="text-right text-text dark:text-text-dark">
                        {formatShareDate(share.createdAt)}
                      </dd>
                      <dt className="font-medium text-gray-500 dark:text-gray-400">
                        <FormattedMessage id="account.shares.table.size" />
                      </dt>
                      <dd className="text-right text-text dark:text-text-dark">
                        {byteToHumanSizeString(share.size)}
                      </dd>
                      <dt className="font-medium text-gray-500 dark:text-gray-400">
                        <FormattedMessage id="account.shares.table.visitors" />
                      </dt>
                      <dd className="text-right text-text dark:text-text-dark">
                        {share.security.maxViews ? (
                          <FormattedMessage
                            id="account.shares.table.visitor-count"
                            values={{
                              count: share.views,
                              max: share.security.maxViews,
                            }}
                          />
                        ) : (
                          share.views
                        )}
                      </dd>
                    </dl>

                    <div className="flex items-center justify-between gap-3">
                      <div
                        className="flex min-w-0 items-center gap-1 truncate text-xs text-gray-500 dark:text-gray-400"
                        title={share.id}
                      >
                        <span className="truncate">
                          ID: {shortShareId(share.id)}
                        </span>
                        {share.security.passwordProtected && (
                          <TbLock
                            className="shrink-0 text-orange-500"
                            title={t("account.shares.table.password-protected")}
                            size={14}
                          />
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Link href={`/share/${share.id}/edit`}>
                          <button
                            className="rounded-lg p-1.5 text-orange-600 transition-colors hover:bg-orange-50 hover:text-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20 dark:hover:text-orange-300"
                            aria-label={t("account.shares.action.edit")}
                          >
                            <TbEdit size={18} />
                          </button>
                        </Link>
                        <button
                          onClick={() => openShareInformation(share)}
                          className="rounded-lg p-1.5 text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 dark:hover:text-blue-300"
                          aria-label={t("account.shares.action.information")}
                        >
                          <TbInfoCircle size={18} />
                        </button>
                        <button
                          onClick={() => copyShareLink(share)}
                          className="rounded-lg p-1.5 text-primary-600 transition-colors hover:bg-primary-50 hover:text-primary-700 dark:text-primary-400 dark:hover:bg-primary-900/20 dark:hover:text-primary-300"
                          aria-label={t("account.shares.action.copy-link")}
                        >
                          <TbLink size={18} />
                        </button>
                        <button
                          onClick={() => confirmDeleteShare(share)}
                          className="rounded-lg p-1.5 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                          aria-label={t("account.shares.action.delete")}
                        >
                          <TbTrash size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden w-full overflow-hidden md:block">
              <Table
                className="table-fixed"
                wrapperClassName="overflow-visible"
              >
                <Table.Header>
                  <Table.Row>
                    <Table.Cell header className="w-[48%] px-3 lg:w-[38%]">
                      <div className="flex items-center gap-2">
                        <FormattedMessage id="account.shares.table.name" />
                        <TableSortIcon
                          sort={sort}
                          setSort={setSort}
                          property="name"
                        />
                      </div>
                    </Table.Cell>
                    <Table.Cell
                      header
                      className="hidden w-[9%] px-3 xl:table-cell"
                    >
                      <div className="flex items-center gap-2">
                        <FormattedMessage id="account.shares.table.visitors" />
                        <TableSortIcon
                          sort={sort}
                          setSort={setSort}
                          property="views"
                        />
                      </div>
                    </Table.Cell>
                    <Table.Cell
                      header
                      className="hidden w-[10%] px-3 lg:table-cell"
                    >
                      <div className="flex items-center gap-2">
                        <FormattedMessage id="account.shares.table.size" />
                        <TableSortIcon
                          sort={sort}
                          setSort={setSort}
                          property="size"
                        />
                      </div>
                    </Table.Cell>
                    <Table.Cell
                      header
                      className="hidden w-[14%] px-3 md:table-cell"
                    >
                      <div className="flex items-center gap-2">
                        <FormattedMessage id="account.shares.table.createdAt" />
                        <TableSortIcon
                          sort={sort}
                          setSort={setSort}
                          property="createdAt"
                        />
                      </div>
                    </Table.Cell>
                    <Table.Cell header className="w-[22%] px-3 md:w-[14%]">
                      <div className="flex items-center gap-2">
                        <FormattedMessage id="account.shares.table.expiresAt" />
                        <TableSortIcon
                          sort={sort}
                          setSort={setSort}
                          property="expiration"
                        />
                      </div>
                    </Table.Cell>
                    <Table.Cell
                      header
                      className="w-[30%] px-3 md:w-[15%]"
                    ></Table.Cell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {sortedShares!.map((share) => (
                    <Table.Row key={share.id}>
                      <Table.Cell className="px-3 !whitespace-normal align-top">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <Input
                              maxLength={128}
                              value={
                                editingNames[share.id] ?? share.name ?? share.id
                              }
                              onChange={(event) =>
                                setEditingNames({
                                  ...editingNames,
                                  [share.id]: event.target.value,
                                })
                              }
                            />
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              const name = editingNames[share.id]?.trim();
                              shareService
                                .updateName(share.id, name)
                                .then((updatedShare) => {
                                  setShares(
                                    shares.map((item) =>
                                      item.id === share.id
                                        ? { ...item, name: updatedShare.name }
                                        : item,
                                    ),
                                  );
                                  toast.success(
                                    t("account.shares.notify.name-saved"),
                                  );
                                })
                                .catch(toast.axiosError);
                            }}
                          >
                            {t("common.button.save")}
                          </Button>
                        </div>
                        <div className="mt-2 flex flex-col gap-2">
                          <Checkbox
                            label={t("account.shares.table.allow-uploads")}
                            checked={share.allowPublicUpload}
                            onChange={(event) =>
                              updateShareFlag(
                                share.id,
                                "allowPublicUpload",
                                event.target.checked,
                              )
                            }
                          />
                          <Checkbox
                            label={t("account.shares.table.allow-versioning")}
                            checked={share.allowVersioning}
                            onChange={(event) =>
                              updateShareFlag(
                                share.id,
                                "allowVersioning",
                                event.target.checked,
                              )
                            }
                          />
                        </div>
                      </Table.Cell>
                      <Table.Cell className="hidden px-3 align-top xl:table-cell">
                        {share.security.maxViews ? (
                          <FormattedMessage
                            id="account.shares.table.visitor-count"
                            values={{
                              count: share.views,
                              max: share.security.maxViews,
                            }}
                          />
                        ) : (
                          share.views
                        )}
                      </Table.Cell>
                      <Table.Cell className="hidden px-3 align-top lg:table-cell">
                        {byteToHumanSizeString(share.size)}
                      </Table.Cell>
                      <Table.Cell className="hidden px-3 align-top md:table-cell">
                        {formatShareDate(share.createdAt)}
                      </Table.Cell>
                      <Table.Cell className="px-3 align-top">
                        {moment(share.expiration).unix() === 0 ? (
                          <FormattedMessage id="account.shares.table.expiry-never" />
                        ) : (
                          formatShareDate(share.expiration)
                        )}
                      </Table.Cell>
                      <Table.Cell className="px-3 align-top">
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center justify-end gap-2">
                            <Link href={`/share/${share.id}/edit`}>
                              <button
                                className="p-1.5 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:text-orange-400 dark:hover:text-orange-300 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                                aria-label={t("account.shares.action.edit")}
                              >
                                <TbEdit size={18} />
                              </button>
                            </Link>
                            <button
                              onClick={() => {
                                showShareInformationsModal(
                                  modals,
                                  share,
                                  parseInt(config.get("share.maxSize")),
                                );
                              }}
                              className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                              aria-label={t(
                                "account.shares.action.information",
                              )}
                            >
                              <TbInfoCircle size={18} />
                            </button>
                            <button
                              onClick={() => {
                                if (
                                  typeof window !== "undefined" &&
                                  window.isSecureContext
                                ) {
                                  clipboard.copy(
                                    `${window.location.origin}/s/${share.id}`,
                                  );
                                  toast.success(t("common.notify.copied-link"));
                                } else {
                                  showShareLinkModal(modals, share.id);
                                }
                              }}
                              className="p-1.5 text-primary-600 hover:text-primary-700 hover:bg-primary-50 dark:text-primary-400 dark:hover:text-primary-300 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                              aria-label={t("account.shares.action.copy-link")}
                            >
                              <TbLink size={18} />
                            </button>
                            <button
                              onClick={() => {
                                modals.openConfirmModal({
                                  title: t(
                                    "account.shares.modal.delete.title",
                                    {
                                      share: share.id,
                                    },
                                  ),
                                  children: (
                                    <p className="text-sm">
                                      <FormattedMessage id="account.shares.modal.delete.description" />
                                    </p>
                                  ),
                                  confirmProps: {
                                    variant: "danger",
                                  },
                                  labels: {
                                    confirm: t("common.button.delete"),
                                    cancel: t("common.button.cancel"),
                                  },
                                  onConfirm: () => {
                                    shareService.remove(share.id);
                                    setShares(
                                      shares.filter(
                                        (item) => item.id !== share.id,
                                      ),
                                    );
                                  },
                                });
                              }}
                              className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              aria-label={t("account.shares.action.delete")}
                            >
                              <TbTrash size={18} />
                            </button>
                          </div>
                          <div
                            className="flex max-w-full items-center gap-1 truncate text-[11px] leading-4 text-gray-500 dark:text-gray-400"
                            title={share.id}
                          >
                            <span className="truncate">
                              {shortShareId(share.id)}
                            </span>
                            {share.security.passwordProtected && (
                              <TbLock
                                className="shrink-0 text-orange-500"
                                title={t(
                                  "account.shares.table.password-protected",
                                )}
                                size={14}
                              />
                            )}
                          </div>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          </>
        )}
      </Container>
    </>
  );
};

const formatShareDate = (date: Date | string): string =>
  moment(date).format("YYYY/MM/DD HH:mm");

const shortShareId = (id: string): string =>
  id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;

const getSortValue = (share: MyShare, property: string): number | string => {
  if (property === "name") return share.name || share.id;
  if (property === "createdAt" || property === "expiration")
    return new Date(share[property]).getTime();
  if (property === "views") return share.views;
  if (property === "size") return share.size;
  return share.id;
};

export default MyShares;
