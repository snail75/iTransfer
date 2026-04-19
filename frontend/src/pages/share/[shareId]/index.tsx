import { GetServerSidePropsContext } from "next";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import { AxiosError } from "axios";
import Meta from "../../../components/Meta";
import DownloadAllButton from "../../../components/share/DownloadAllButton";
import FileList from "../../../components/share/FileList";
import Dropzone from "../../../components/upload/Dropzone";
import UploadFileList from "../../../components/upload/FileList";
import showEnterPasswordModal from "../../../components/share/showEnterPasswordModal";
import showErrorModal from "../../../components/share/showErrorModal";
import useConfig from "../../../hooks/config.hook";
import useTranslate from "../../../hooks/useTranslate.hook";
import shareService from "../../../services/share.service";
import { Share as ShareType } from "../../../types/share.type";
import toast from "../../../utils/toast.util";
import { byteToHumanSizeString } from "../../../utils/fileSize.util";
import { Button, Container } from "../../../components/ui";
import { useModals } from "../../../contexts/ModalContext";
import { FileUpload } from "../../../types/File.type";

export function getServerSideProps(context: GetServerSidePropsContext) {
  return {
    props: { shareId: context.params!.shareId },
  };
}

const Share = ({ shareId }: { shareId: string }) => {
  const modals = useModals();
  const [share, setShare] = useState<ShareType>();
  const [uploadingFiles, setUploadingFiles] = useState<FileUpload[]>([]);
  const [isUploadingBack, setIsUploadingBack] = useState(false);
  const t = useTranslate();
  const config = useConfig();

  const getShareToken = async (password?: string) => {
    await shareService
      .getShareToken(shareId, password)
      .then(() => {
        modals.closeAll();
        getFiles();
      })
      .catch((e) => {
        const { error } = e.response.data;
        if (error == "share_max_views_exceeded") {
          showErrorModal(
            modals,
            t("share.error.visitor-limit-exceeded.title"),
            t("share.error.visitor-limit-exceeded.description"),
            "go-home",
          );
        } else if (error == "share_password_required") {
          showEnterPasswordModal(modals, getShareToken);
        } else {
          toast.axiosError(e);
        }
      });
  };

  const getFiles = async () => {
    shareService
      .get(shareId)
      .then((share) => {
        setShare(share);
      })
      .catch((e) => {
        const { error } = e.response.data;
        if (e.response.status == 404) {
          if (error == "share_removed") {
            showErrorModal(
              modals,
              t("share.error.removed.title"),
              e.response.data.message,
              "go-home",
            );
          } else {
            showErrorModal(
              modals,
              t("share.error.not-found.title"),
              t("share.error.not-found.description"),
              "go-home",
            );
          }
        } else if (e.response.status == 403 && error == "private_share") {
          showErrorModal(
            modals,
            t("share.error.access-denied.title"),
            t("share.error.access-denied.description"),
          );
        } else if (error == "share_password_required") {
          showEnterPasswordModal(modals, getShareToken);
        } else if (error == "share_token_required") {
          getShareToken();
        } else {
          showErrorModal(
            modals,
            t("common.error"),
            t("common.error.unknown"),
            "go-home",
          );
        }
      });
  };

  useEffect(() => {
    getFiles();
  }, []);

  const appendBackUploadFiles = (files: FileUpload[]) => {
    setUploadingFiles([...files, ...uploadingFiles]);
  };

  const uploadFileToShare = async (
    file: File,
    uploadName: string,
    replaceFileId?: string,
    onProgress?: (progress: number) => void,
  ) => {
    if (!share) return;

    const chunkSize = parseInt(config.get("share.chunkSize"));
    let fileId: string | undefined;
    let chunks = Math.ceil(file.size / chunkSize);
    if (chunks === 0) chunks = 1;

    for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
      const from = chunkIndex * chunkSize;
      const blob = file.slice(from, from + chunkSize);

      try {
        const response = await shareService.uploadFile(
          share.id,
          blob,
          { id: fileId, name: uploadName, replaceFileId },
          chunkIndex,
          chunks,
        );
        fileId = response.id;
        onProgress?.(((chunkIndex + 1) / chunks) * 100);
      } catch (e) {
        if (
          e instanceof AxiosError &&
          e.response?.data.error === "unexpected_chunk_index"
        ) {
          chunkIndex = e.response.data.expectedChunkIndex - 1;
          continue;
        }
        throw e;
      }
    }
  };

  const replaceFileVersion = (fileToReplace: { id: string; name: string }) => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !share) return;

      setIsUploadingBack(true);
      try {
        await uploadFileToShare(file, file.name, fileToReplace.id);
        toast.success(t("share.notify.file-version-replaced"));
        await getFiles();
      } catch (e) {
        toast.axiosError(e);
      } finally {
        setIsUploadingBack(false);
      }
    };
    input.click();
  };

  const uploadBackFiles = async () => {
    if (!share || uploadingFiles.length === 0) return;

    setIsUploadingBack(true);

    try {
      for (let fileIndex = 0; fileIndex < uploadingFiles.length; fileIndex++) {
        const file = uploadingFiles[fileIndex];
        await uploadFileToShare(file, file.name, undefined, (progress) => {
          setUploadingFiles((files) =>
            files.map((current, index) =>
              index === fileIndex
                ? Object.assign(current, { uploadingProgress: progress })
                : current,
            ),
          );
        });
      }

      toast.success(t("common.button.save"));
      setUploadingFiles([]);
      await getFiles();
    } catch (e) {
      toast.axiosError(e);
    } finally {
      setIsUploadingBack(false);
    }
  };

  return (
    <>
      <Meta
        title={t("share.title", { shareId: share?.name || shareId })}
        description={t("share.description")}
      />
      <Container>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex-1 max-w-[70%]">
            <h1 className="text-2xl font-bold text-text dark:text-text-dark mb-2">
              {share?.name || share?.id}
            </h1>
            {share?.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                {share.description}
              </p>
            )}
            {share?.files?.length > 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-500">
                <FormattedMessage
                  id="share.fileCount"
                  values={{
                    count: share?.files?.length || 0,
                    size: byteToHumanSizeString(
                      share?.files?.reduce(
                        (total: number, file: { size: string }) =>
                          total + parseInt(file.size),
                        0,
                      ) || 0,
                    ),
                  }}
                />
              </p>
            )}
          </div>

          {share && share.files.length > 1 && (
            <DownloadAllButton
              shareId={shareId}
              zipVersion={share.files
                .map((file: { id: string }) => file.id)
                .join("|")}
            />
          )}
        </div>

        <FileList
          files={share?.files}
          setShare={setShare}
          share={share!}
          isLoading={!share}
          onReplaceFile={replaceFileVersion}
        />
        {(share?.allowPublicUpload || share?.allowVersioning) && (
          <div className="mt-8">
            <div className="flex justify-between items-center gap-4 mb-4">
              <h2 className="text-lg font-bold text-text dark:text-text-dark">
                {share.allowPublicUpload
                  ? t("share.upload-back.title")
                  : t("share.upload-back.replace-title")}
              </h2>
              <Button
                loading={isUploadingBack}
                disabled={!share.allowPublicUpload || !uploadingFiles.length}
                onClick={uploadBackFiles}
              >
                {t("share.upload-back.button")}
              </Button>
            </div>
            {share.allowPublicUpload ? (
              <Dropzone
                title={t("share.upload-back.dropzone-title")}
                maxShareSize={parseInt(config.get("share.maxSize"))}
                onFilesChanged={appendBackUploadFiles}
                isUploading={isUploadingBack}
              />
            ) : (
              <p className="rounded-lg border border-gray-200 p-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
                {t("share.upload-back.replace-hint")}
              </p>
            )}
            {uploadingFiles.length > 0 && (
              <div className="mt-4">
                <UploadFileList
                  files={uploadingFiles}
                  setFiles={(files) => setUploadingFiles(files as FileUpload[])}
                />
              </div>
            )}
          </div>
        )}
      </Container>
    </>
  );
};

export default Share;
