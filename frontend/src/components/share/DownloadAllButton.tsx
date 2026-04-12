import { useState } from "react";
import { FormattedMessage } from "react-intl";
import shareService from "../../services/share.service";
import { Button } from "../ui";

const DownloadAllButton = ({
  shareId,
}: {
  shareId: string;
  zipVersion?: string;
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const downloadAll = async () => {
    setIsLoading(true);
    await shareService
      .downloadFile(shareId, "zip")
      .finally(() => setIsLoading(false));
  };

  return (
    <Button variant="outline" loading={isLoading} onClick={downloadAll}>
      <FormattedMessage id="share.button.download-all" />
    </Button>
  );
};

export default DownloadAllButton;
