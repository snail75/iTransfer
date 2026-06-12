import { GetServerSidePropsContext } from "next";
import moment from "moment";
import { useEffect, useRef, useState } from "react";
import { FormattedMessage } from "react-intl";
import Meta from "../../../components/Meta";
import showErrorModal from "../../../components/share/showErrorModal";
import EditableUpload from "../../../components/upload/EditableUpload";
import useConfig from "../../../hooks/config.hook";
import useConfirmLeave from "../../../hooks/confirm-leave.hook";
import useTranslate from "../../../hooks/useTranslate.hook";
import shareService from "../../../services/share.service";
import { Share as ShareType } from "../../../types/share.type";
import { useModals } from "../../../contexts/ModalContext";
import {
  Button,
  Checkbox,
  Container,
  LoadingSpinner,
  NumberInput,
  Select,
} from "../../../components/ui";
import { getExpirationPreview } from "../../../utils/date.util";
import toast from "../../../utils/toast.util";

export function getServerSideProps(context: GetServerSidePropsContext) {
  return {
    props: { shareId: context.params!.shareId },
  };
}

const Share = ({ shareId }: { shareId: string }) => {
  const t = useTranslate();
  const modals = useModals();
  const config = useConfig();

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingExpiration, setIsSavingExpiration] = useState(false);
  const [share, setShare] = useState<ShareType>();
  const [expirationNum, setExpirationNum] = useState(1);
  const [expirationUnit, setExpirationUnit] = useState("-days");
  const [neverExpires, setNeverExpires] = useState(false);
  const [expirationError, setExpirationError] = useState<string>();
  const loadingRef = useRef(false);

  useConfirmLeave({
    message: t("upload.notify.confirm-leave"),
    enabled: isLoading,
  });

  const loadShare = async (retryCount = 0) => {
    // Prevent multiple simultaneous calls
    if (loadingRef.current) {
      console.log(`[ShareEdit] Already loading share, skipping...`);
      return;
    }
    
    loadingRef.current = true;
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second
    
    try {
      console.log(`[ShareEdit] Loading share ${shareId} (attempt ${retryCount + 1}/${maxRetries + 1})`);
      const share = await shareService.getFromOwner(shareId);
      console.log(`[ShareEdit] Share loaded successfully:`, share);
      setShare(share);
      const expirationForm = getExpirationFormValues(share.expiration);
      setExpirationNum(expirationForm.expirationNum);
      setExpirationUnit(expirationForm.expirationUnit);
      setNeverExpires(expirationForm.neverExpires);
      setIsLoading(false);
    } catch (e: any) {
      console.error(`[ShareEdit] Error loading share ${shareId}:`, e);
      
      // Retry logic for 404 errors (might be temporary due to share state changes)
      if (e.response?.status === 404 && retryCount < maxRetries) {
        console.log(`[ShareEdit] 404 error, retrying in ${retryDelay * (retryCount + 1)}ms...`);
        loadingRef.current = false;
        await new Promise((resolve) => setTimeout(resolve, retryDelay * (retryCount + 1)));
        return loadShare(retryCount + 1);
      }
      
      const error = e.response?.data?.error;
      if (e.response?.status == 404) {
        if (error == "share_removed") {
          showErrorModal(
            modals,
            t("share.error.removed.title"),
            e.response.data.message,
          );
        } else {
          console.error(`[ShareEdit] Share not found: ${shareId}`, {
            status: e.response?.status,
            statusText: e.response?.statusText,
            data: e.response?.data,
            message: e.message,
          });
          showErrorModal(
            modals,
            t("share.error.not-found.title"),
            t("share.error.not-found.description"),
          );
        }
      } else if (e.response?.status == 403 && error == "share_removed") {
        showErrorModal(
          modals,
          t("share.error.access-denied.title"),
          t("share.error.access-denied.description"),
        );
      } else {
        console.error(`[ShareEdit] Unknown error:`, {
          status: e.response?.status,
          statusText: e.response?.statusText,
          data: e.response?.data,
          message: e.message,
        });
        showErrorModal(modals, t("common.error"), t("common.error.unknown"));
      }
      setIsLoading(false);
    } finally {
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    // Only load share once when component mounts or shareId changes
    // Don't reload when modals or t change
    loadShare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId]);

  const saveExpiration = async () => {
    const expirationString = neverExpires
      ? "never"
      : expirationNum + expirationUnit;
    const maxExpiration = config.get("share.maxExpiration");
    const expirationDate = moment().add(
      expirationNum,
      expirationUnit.replace("-", "") as moment.unitOfTime.DurationConstructor,
    );

    if (
      maxExpiration.value !== 0 &&
      (neverExpires ||
        expirationDate.isAfter(
          moment().add(maxExpiration.value, maxExpiration.unit),
        ))
    ) {
      setExpirationError(
        t("upload.modal.expires.error.too-long", {
          max: moment
            .duration(maxExpiration.value, maxExpiration.unit)
            .humanize(),
        }),
      );
      return;
    }

    setIsSavingExpiration(true);
    setExpirationError(undefined);

    try {
      const updatedShare = await shareService.updateExpiration(
        shareId,
        expirationString,
      );
      setShare(updatedShare);
      const expirationForm = getExpirationFormValues(updatedShare.expiration);
      setExpirationNum(expirationForm.expirationNum);
      setExpirationUnit(expirationForm.expirationUnit);
      setNeverExpires(expirationForm.neverExpires);
      toast.success(t("account.shares.notify.name-saved"));
    } catch (error) {
      toast.axiosError(error);
    } finally {
      setIsSavingExpiration(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <Meta title={t("share.edit.title", { shareId })} />
      {share && (
        <Container>
          <div className="mb-6 border-b border-gray-200 pb-6 dark:border-gray-700">
            <div className="mb-3 flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-text dark:text-text-dark">
                <FormattedMessage id="account.shares.table.expiresAt" />
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {moment(share.expiration).unix() === 0 ? (
                  <FormattedMessage id="account.shares.table.expiry-never" />
                ) : (
                  moment(share.expiration).format("YYYY/MM/DD HH:mm")
                )}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start">
              <NumberInput
                min={1}
                max={99999}
                precision={0}
                label={t("upload.modal.expires.label")}
                disabled={neverExpires}
                value={expirationNum}
                onChange={(value) => {
                  setExpirationNum(value || 1);
                  setExpirationError(undefined);
                }}
                error={expirationError}
              />
              <Select
                disabled={neverExpires}
                value={expirationUnit}
                onChange={(event) => {
                  setExpirationUnit(event.target.value);
                  setExpirationError(undefined);
                }}
                options={expirationUnitOptions(t, expirationNum)}
                className="md:mt-6"
              />
              <Button
                loading={isSavingExpiration}
                onClick={saveExpiration}
                className="md:mt-6"
              >
                <FormattedMessage id="common.button.save" />
              </Button>
            </div>
            {config.get("share.maxExpiration").value === 0 && (
              <div className="mt-3">
                <Checkbox
                  label={t("upload.modal.expires.never-long")}
                  checked={neverExpires}
                  onChange={(event) => {
                    setNeverExpires(event.target.checked);
                    setExpirationError(undefined);
                  }}
                />
              </div>
            )}
            <p className="mt-3 text-xs italic text-gray-500 dark:text-gray-400">
              {getExpirationPreview(
                {
                  neverExpires: t("upload.modal.completed.never-expires"),
                  expiresOn: t("upload.modal.completed.expires-on"),
                },
                {
                  values: {
                    never_expires: neverExpires,
                    expiration_num: expirationNum,
                    expiration_unit: expirationUnit,
                  },
                },
              )}
            </p>
          </div>
        </Container>
      )}
      <EditableUpload shareId={shareId} files={share?.files || []} />
    </>
  );
};

const getExpirationFormValues = (
  expiration: Date | string,
) => {
  if (moment(expiration).unix() === 0) {
    return {
      expirationNum: 1,
      expirationUnit: "-days",
      neverExpires: true,
    };
  }

  const minutes = Math.max(1, moment(expiration).diff(moment(), "minutes"));
  const candidates = [
    { unit: "-years", minutes: 60 * 24 * 365 },
    { unit: "-months", minutes: 60 * 24 * 30 },
    { unit: "-weeks", minutes: 60 * 24 * 7 },
    { unit: "-days", minutes: 60 * 24 },
    { unit: "-hours", minutes: 60 },
    { unit: "-minutes", minutes: 1 },
  ];
  const candidate =
    candidates.find(({ minutes: unitMinutes }) => minutes >= unitMinutes) ||
    candidates[candidates.length - 1];

  return {
    expirationNum: Math.max(1, Math.floor(minutes / candidate.minutes)),
    expirationUnit: candidate.unit,
    neverExpires: false,
  };
};

const expirationUnitOptions = (
  t: ReturnType<typeof useTranslate>,
  expirationNum: number,
) => [
  {
    value: "-minutes",
    label:
      expirationNum === 1
        ? t("upload.modal.expires.minute-singular")
        : t("upload.modal.expires.minute-plural"),
  },
  {
    value: "-hours",
    label:
      expirationNum === 1
        ? t("upload.modal.expires.hour-singular")
        : t("upload.modal.expires.hour-plural"),
  },
  {
    value: "-days",
    label:
      expirationNum === 1
        ? t("upload.modal.expires.day-singular")
        : t("upload.modal.expires.day-plural"),
  },
  {
    value: "-weeks",
    label:
      expirationNum === 1
        ? t("upload.modal.expires.week-singular")
        : t("upload.modal.expires.week-plural"),
  },
  {
    value: "-months",
    label:
      expirationNum === 1
        ? t("upload.modal.expires.month-singular")
        : t("upload.modal.expires.month-plural"),
  },
  {
    value: "-years",
    label:
      expirationNum === 1
        ? t("upload.modal.expires.year-singular")
        : t("upload.modal.expires.year-plural"),
  },
];

export default Share;
