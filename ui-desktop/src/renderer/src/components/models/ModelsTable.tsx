import { formatModelName } from '../chat/utils';
import { useRef, useState } from 'react';

import { abbreviateAddress } from '../../utils';
import { isSecureModel, SECURE_BADGE_TOOLTIP } from '../chat/utils';
import {
  IconDownload,
  IconCopy,
  IconCoin,
  IconTag,
  IconHash,
  IconX,
  IconShieldLock,
  IconBoxOff,
} from '@tabler/icons-react';
import path from 'path';
import {
  Grid,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  IconButton,
  InfoSection,
  InfoRow,
  InfoLabel,
  InfoValue,
  PriceValue,
  HashChip,
  CopyIcon,
  TagRow,
  Tag,
  SecureTag,
  EmptyState,
  DownloadOverlay,
  DownloadHeader,
  DownloadTitle,
  Spinner,
  ProgressTrack,
  ProgressFill,
  ProgressInfo,
} from './ModelCard.styles';


// Event payload for download progress events from the SSE stream
interface DownloadProgressEvent {
  status: 'downloading' | 'completed' | 'error';
  downloaded: number;
  total: number;
  percentage: number;
  error?: string;
  timeUpdated: number;
}

// Type for the progress callback function
type DownloadProgressCallback = (event: DownloadProgressEvent) => void;

function ModelCard({ onSelect, model, openSelectDownloadFolder, toasts, client, config }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedSize, setDownloadedSize] = useState('0 KB');
  const [totalSize, setTotalSize] = useState('0 KB');
  const [latestUploadTime, setLatestUploadTime] = useState(0);
  const cancelDownloadRef = useRef<(() => void) | null>(null);

  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const handleDownloadError = (error) => {
    if (typeof error === 'string') {
      if (error.includes("invalid CID")) {
        toasts.toast("error", "Invalid CID specified in the model.");
      } else if (error.includes("failed to find")) {
        toasts.toast("error", "Model is not found in IPFS.");
      } else {
        toasts.toast("error", "Failed to download model");
      }
    } else {
      toasts.toast("error", "Failed to download model");
    }
    setIsDownloading(false);
  }

  const handleFolderSelect = async (e) => {
    e.stopPropagation();
    try {
      const result = await openSelectDownloadFolder();
      const { canceled, filePaths } = result;
      if (canceled) {
        return;
      }

      const folderPath = filePaths[0];

      // Start download with progress tracking
      setIsDownloading(true);
      setDownloadProgress(0);
      setDownloadedSize('0 KB');
      setTotalSize('0 KB');
      setLatestUploadTime(Date.now());

      const filePath = path.join(folderPath, model.IpfsCID || model.metadataCIDHash);
      // Use streaming download
      cancelDownloadRef.current = streamIpfsFileDownload({
        cid: model.IpfsCID || model.metadataCIDHash,
        destinationPath: filePath,
        onProgress: (progressEvent) => {
          const { downloaded, total, percentage, timeUpdated } = progressEvent;
          setDownloadProgress(percentage);
          setDownloadedSize(formatBytes(downloaded));
          setTotalSize(formatBytes(total));
          setLatestUploadTime(timeUpdated);
        },
        onComplete: () => {
          setIsDownloading(false);
          toasts.toast("success", "Model downloaded successfully");
          cancelDownloadRef.current = null;
        },
        onError: (error) => {
          setIsDownloading(false);
          toasts.toast("error", `Failed to download model: ${error}`);
          cancelDownloadRef.current = null;
        }
      });
    } catch (error) {
      handleDownloadError(error);
    }
  };

  const streamIpfsFileDownload = ({
    cid,
    destinationPath,
    onProgress,
    onComplete,
    onError
  }: {
    cid: string,
    destinationPath: string,
    onProgress: DownloadProgressCallback,
    onComplete: DownloadProgressCallback,
    onError: (error: string) => void
  }): () => void => {
    // Create AbortController for cancellation
    const controller = new AbortController();
    const { signal } = controller;

    // Start the download
    (async () => {
      try {
        const authHeaders = await client.getAuthHeaders();
        const destEncoded = encodeURIComponent(destinationPath);
        const url = `${config.chain.localProxyRouterUrl}/ipfs/download/stream/${cid}?dest=${destEncoded}`;

        // Use fetch API with streaming enabled
        const response = await fetch(url, {
          method: 'GET',
          headers: authHeaders,
          signal: signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Set up a reader for the response body stream
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Failed to get response reader');
        }

        // Initial progress state
        let downloaded = 0;
        let lastProgressUpdate = Date.now();
        const progressUpdateInterval = 100; // Update progress at most every 100ms
        const textDecoder = new TextDecoder();

        // Process the stream
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            // Download completed successfully
            onComplete({
              status: 'completed',
              downloaded,
              total: downloaded,
              percentage: 100,
              timeUpdated: Date.now()
            });
            break;
          }
          const decodedString = textDecoder.decode(value, { stream: true });
          const objects = decodedString.split('data: ').filter(Boolean).map(s => {
            try {
              return JSON.parse(s);
            } catch (e) {
              return null;
            }
          }).filter(Boolean);

          if (objects.length === 0) {
            continue;
          }

          const latestProgress = objects[objects.length - 1];

          if (latestProgress.error) {
            handleDownloadError(latestProgress.error);
            break;
          }

          const now = Date.now();
          if (now - lastProgressUpdate > progressUpdateInterval) {
            lastProgressUpdate = now;

            onProgress({
              status: 'downloading',
              downloaded: latestProgress.downloaded,
              total: latestProgress.total,
              percentage: latestProgress.percentage,
              timeUpdated: lastProgressUpdate
            });
          }
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        } else {
          const errorMessage = error instanceof Error ? error.message : String(error);
          onError(`Failed to download: ${errorMessage || 'Unknown error'}`);
        }
      }
    })();

    // Return cancel function
    return () => controller.abort();
  }

  const cancelDownload = (e) => {
    e.stopPropagation();
    if (cancelDownloadRef.current) {
      cancelDownloadRef.current();
      cancelDownloadRef.current = null;
      setIsDownloading(false);
      toasts.toast("info", "Download canceled");
    }
  };

  const copyId = () => {
    navigator.clipboard.writeText(model.Id);
    toasts.toast("success", "ID copied to clipboard", {
      autoClose: 700
    });
  };

  const copyCIDHash = () => {
    navigator.clipboard.writeText(model.IpfsCID);
    toasts.toast("success", "CID Hash copied to clipboard", {
      autoClose: 700
    });
  };

  // Format MOR values to prevent scientific notation and limit decimals
  const formatMorValue = (value) => {
    if (!value) return '0 MOR';

    // Convert to MOR by dividing by 10^18
    const morValue = value / (10 ** 18);

    // For very small values, use a different format to avoid scientific notation
    if (morValue < 0.000001) {
      return morValue.toFixed(12).replace(/\.?0+$/, '') + ' MOR';
    } else if (morValue < 0.001) {
      return morValue.toFixed(8).replace(/\.?0+$/, '') + ' MOR';
    } else if (morValue < 1) {
      return morValue.toFixed(6).replace(/\.?0+$/, '') + ' MOR';
    } else {
      return morValue.toFixed(4).replace(/\.?0+$/, '') + ' MOR';
    }
  };

  const formatDate = (date) => {
    return date.toLocaleString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // TEE ("tee") is a security attribute, not a family tag — surfaced as its
  // own Secure pill (same copy/treatment as the chat model picker) instead of
  // a raw tag string.
  const isSecure = isSecureModel(model);
  const visibleTags = (model.Tags || []).filter(
    (t) => String(t).toLowerCase().trim() !== 'tee',
  );

  return (
    <Card onClick={() => onSelect(model.Id)}>
      {isDownloading && (
        <DownloadOverlay onClick={(e) => e.stopPropagation()}>
          <DownloadHeader>
            <DownloadTitle>
              <Spinner />
              Downloading model
            </DownloadTitle>
            <IconButton $danger onClick={cancelDownload} aria-label="Cancel download">
              <IconX size={16} />
            </IconButton>
          </DownloadHeader>

          <ProgressTrack>
            <ProgressFill $percent={downloadProgress} />
          </ProgressTrack>

          <ProgressInfo>
            <span>{downloadedSize} / {totalSize}</span>
            <span>{downloadProgress.toFixed(1)}%</span>
          </ProgressInfo>
          <ProgressInfo>
            <span>Last updated at {formatDate(new Date(latestUploadTime))}</span>
          </ProgressInfo>
        </DownloadOverlay>
      )}

      <CardBody>
        <CardHeader>
          <CardTitle>{formatModelName(model.Name) || "Unnamed Model"}</CardTitle>
          <IconButton
            onClick={handleFolderSelect}
            aria-label="Download model"
            title="Download model"
          >
            <IconDownload size={18} />
          </IconButton>
        </CardHeader>

        {isSecure && (
          <TagRow style={{ marginBottom: '0.6rem' }}>
            <SecureTag title={SECURE_BADGE_TOOLTIP}>
              <IconShieldLock size={13} strokeWidth={2.2} />
              Secure
            </SecureTag>
          </TagRow>
        )}

        <InfoSection>
          <InfoRow>
            <InfoLabel>
              <IconHash size={16} strokeWidth={2} />
              ID
            </InfoLabel>
            <InfoValue>
              <HashChip>
                {abbreviateAddress(model?.Id || '', 6)}
                <CopyIcon
                  onClick={(e) => {
                    e.stopPropagation();
                    copyId();
                  }}
                >
                  <IconCopy size={14} />
                </CopyIcon>
              </HashChip>
            </InfoValue>
          </InfoRow>

          <InfoRow>
            <InfoLabel>
              <IconHash size={16} strokeWidth={2} />
              CID hash
            </InfoLabel>
            <InfoValue>
              <HashChip>
                {abbreviateAddress(model?.IpfsCID, 6)}
                <CopyIcon
                  onClick={(e) => {
                    e.stopPropagation();
                    copyCIDHash();
                  }}
                >
                  <IconCopy size={14} />
                </CopyIcon>
              </HashChip>
            </InfoValue>
          </InfoRow>

          {model.Fee ? (
            <InfoRow>
              <InfoLabel>
                <IconCoin size={16} strokeWidth={2} />
                Fee
              </InfoLabel>
              <InfoValue>
                <PriceValue>{formatMorValue(model.Fee)}</PriceValue>
              </InfoValue>
            </InfoRow>
          ) : null}

          {model.Stake ? (
            <InfoRow>
              <InfoLabel>
                <IconCoin size={16} strokeWidth={2} />
                Stake
              </InfoLabel>
              <InfoValue>
                <PriceValue>{formatMorValue(model.Stake)}</PriceValue>
              </InfoValue>
            </InfoRow>
          ) : null}

          {visibleTags.length > 0 && (
            <InfoRow>
              <InfoLabel>
                <IconTag size={16} strokeWidth={2} />
                Tags
              </InfoLabel>
              <TagRow>
                {visibleTags.map((tag, index) => (
                  <Tag key={index} className="tag-item">{tag}</Tag>
                ))}
              </TagRow>
            </InfoRow>
          )}
        </InfoSection>
      </CardBody>
    </Card>
  );
}


function ModelsTable({
  setSelectedModel,
  models,
  client,
  openSelectDownloadFolder,
  config,
  toasts,
}: any) {
  const onSelect = (id) => {
    setSelectedModel(models.find((x) => x.Id == id));
  };

  return (
    <Grid>
      {models.length ?
        models.map(x => (
          <ModelCard
            key={x.Id}
            onSelect={onSelect}
            model={x}
            openSelectDownloadFolder={openSelectDownloadFolder}
            toasts={toasts}
            client={client}
            config={config}
          />
        )) :
        <EmptyState>
          <IconBoxOff size={36} strokeWidth={1.5} />
          <div>No models found</div>
        </EmptyState>
      }
    </Grid>
  );
}

export default ModelsTable;
