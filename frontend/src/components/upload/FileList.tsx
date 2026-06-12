import { TbTrash } from "react-icons/tb";
import { TbPencil, TbRefresh } from "react-icons/tb";
import { GrUndo } from "react-icons/gr";
import { FileListItem } from "../../types/File.type";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import UploadProgressIndicator from "./UploadProgressIndicator";
import { FormattedMessage } from "react-intl";
import { Input, Table } from "../ui";
import clsx from "clsx";
import useTranslate from "../../hooks/useTranslate.hook";

const FileListRow = ({
  file,
  onRemove,
  onRestore,
  onRename,
  onReplace,
}: {
  file: FileListItem;
  onRemove?: () => void;
  onRestore?: () => void;
  onRename?: (name: string) => void;
  onReplace?: () => void;
}) => {
  const t = useTranslate();
  const uploadable = "uploadingProgress" in file;
  const uploading =
    uploadable &&
    file.uploadingProgress !== 0 &&
    file.uploadingProgress < 100 &&
    file.uploadingProgress !== -1;
  const queued = uploadable && file.uploadingProgress === 0;
  const removable = uploadable
    ? file.uploadingProgress === 0 || file.uploadingProgress === -1
    : onRemove && !file.deleted;
  const restorable = onRestore && !uploadable && !!file.deleted;
  const deleted = !uploadable && !!file.deleted;
  const displayName = !uploadable && file.newName ? file.newName : file.name;

  return (
    <Table.Row className={clsx(deleted && "opacity-50 line-through")}>
      <Table.Cell>
        {!uploadable && onRename ? (
          <Input
            value={displayName}
            disabled={deleted}
            onChange={(event) => onRename(event.target.value)}
            aria-label={t("upload.filelist.action.rename")}
            className="max-w-md"
          />
        ) : (
          <span>{displayName}</span>
        )}
      </Table.Cell>
      <Table.Cell>{byteToHumanSizeString(+file.size)}</Table.Cell>
      <Table.Cell>
        <div className="flex items-center justify-end gap-2">
          {!uploadable && onRename && !deleted && (
            <TbPencil
              size={18}
              className="text-gray-400 dark:text-gray-500"
              aria-hidden="true"
            />
          )}
          {!uploadable && onReplace && !deleted && (
            <button
              onClick={onReplace}
              className="p-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label={t("upload.filelist.action.replace")}
              title={t("upload.filelist.action.replace")}
            >
              <TbRefresh size={18} />
            </button>
          )}
          {removable && (
            <button
              onClick={onRemove}
              className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              aria-label={t("upload.filelist.action.remove")}
            >
              <TbTrash size={18} />
            </button>
          )}
          {queued && (
            <span
              className="text-xs text-gray-500 dark:text-gray-400"
              title={t("upload.filelist.status.waiting")}
            >
              {t("upload.filelist.status.queued")}
            </span>
          )}
          {uploading && (
            <UploadProgressIndicator progress={file.uploadingProgress} />
          )}
          {uploadable && file.uploadingProgress >= 100 && (
            <UploadProgressIndicator progress={100} />
          )}
          {uploadable && file.uploadingProgress === -1 && (
            <UploadProgressIndicator progress={-1} />
          )}
          {restorable && (
            <button
              onClick={onRestore}
              className="p-1.5 text-primary-600 hover:text-primary-700 hover:bg-primary-50 dark:text-primary-400 dark:hover:text-primary-300 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
              aria-label={t("upload.filelist.action.restore")}
            >
              <GrUndo size={18} />
            </button>
          )}
        </div>
      </Table.Cell>
    </Table.Row>
  );
};

const FileList = <T extends FileListItem = FileListItem>({
  files,
  setFiles,
  onReplace,
}: {
  files: T[];
  setFiles: (files: T[]) => void;
  onReplace?: (file: T) => void;
}) => {
  const remove = (index: number) => {
    const file = files[index];

    if ("uploadingProgress" in file) {
      files.splice(index, 1);
    } else {
      files[index] = { ...file, deleted: true };
    }

    setFiles([...files]);
  };

  const restore = (index: number) => {
    const file = files[index];

    if ("uploadingProgress" in file) {
      return;
    } else {
      files[index] = { ...file, deleted: false };
    }

    setFiles([...files]);
  };

  const rename = (index: number, name: string) => {
    const file = files[index];

    if ("uploadingProgress" in file) return;

    files[index] = { ...file, newName: name };
    setFiles([...files]);
  };

  const rows = files.map((file, i) => (
    <FileListRow
      key={i}
      file={file}
      onRemove={() => remove(i)}
      onRestore={() => restore(i)}
      onRename={
        "uploadingProgress" in file ? undefined : (name) => rename(i, name)
      }
      onReplace={
        onReplace && !("uploadingProgress" in file)
          ? () => onReplace(file)
          : undefined
      }
    />
  ));

  return (
    <div className="overflow-x-auto">
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Cell header>
              <FormattedMessage id="upload.filelist.name" />
            </Table.Cell>
            <Table.Cell header>
              <FormattedMessage id="upload.filelist.size" />
            </Table.Cell>
            <Table.Cell header> </Table.Cell>
          </Table.Row>
        </Table.Header>
        <Table.Body>{rows}</Table.Body>
      </Table>
    </div>
  );
};

export default FileList;
