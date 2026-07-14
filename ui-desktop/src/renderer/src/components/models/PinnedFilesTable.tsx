import { abbreviateAddress } from '../../utils';
import { SECURE_BADGE_TOOLTIP } from '../chat/utils';
import { IconPinnedOff, IconCopy, IconFile, IconTag, IconHash, IconShieldLock, IconBoxOff } from '@tabler/icons-react';
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
  HashChip,
  CopyIcon,
  TagRow,
  Tag,
  SecureTag,
  EmptyState,
} from './ModelCard.styles';


interface PinnedFile {
  fileCID: string;
  fileCIDHash: string;
  metadataCID: string;
  metadataCIDHash: string;
  fileName: string;
  fileSize: number;
  tags: string[] | null;
  modelName: string;
  id: string;
}

function ModelCard({ model, toasts, unpinFile }: { model: PinnedFile, toasts: any, unpinFile: any }) {
  const onUnpinFile = (e) => {
    e.stopPropagation();
    unpinFile(model.fileCIDHash);
    unpinFile(model.metadataCIDHash);
    toasts.toast("success", "File unpinned successfully", { autoClose: 2000 });
  };

  const copyHash = () => {
    navigator.clipboard.writeText(model.metadataCIDHash);
    toasts.toast("success", "Hash copied to clipboard", {
      autoClose: 700
    });
  };

  const copyCID = () => {
    navigator.clipboard.writeText(model.metadataCID);
    toasts.toast("success", "CID copied to clipboard", {
      autoClose: 700
    });
  };

  const copyId = () => {
    navigator.clipboard.writeText(model.id);
    toasts.toast("success", "ID copied to clipboard", {
      autoClose: 700
    });
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '';

    const KB = bytes / 1024;
    const MB = KB / 1024;
    const GB = MB / 1024;

    if (GB >= 1) {
      return `${GB.toFixed(2)} GB`;
    } else if (MB >= 1) {
      return `${MB.toFixed(2)} MB`;
    } else {
      return `${KB.toFixed(2)} KB`;
    }
  };

  // TEE ("tee") is a security attribute, not a family tag — surfaced as its
  // own Secure pill (same copy/treatment as the chat model picker) instead of
  // a raw tag string.
  const isSecure = (model.tags || []).some((t) => String(t).toLowerCase().trim() === 'tee');
  const visibleTags = (model.tags || []).filter(
    (t) => String(t).toLowerCase().trim() !== 'tee',
  );

  return (
    <Card>
      <CardBody>
        <CardHeader>
          <CardTitle>{model.fileName || "Unnamed File"}</CardTitle>
          <IconButton
            $danger
            onClick={onUnpinFile}
            aria-label="Unpin file"
            title="Unpin file"
          >
            <IconPinnedOff size={18} />
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
              CID
            </InfoLabel>
            <InfoValue>
              <HashChip>
                {abbreviateAddress(model.metadataCID, 6)}
                <CopyIcon onClick={() => copyCID()}>
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
                {abbreviateAddress(model.metadataCIDHash, 6)}
                <CopyIcon onClick={() => copyHash()}>
                  <IconCopy size={14} />
                </CopyIcon>
              </HashChip>
            </InfoValue>
          </InfoRow>

          {model.fileSize ? (
            <InfoRow>
              <InfoLabel>
                <IconFile size={16} strokeWidth={2} />
                Size
              </InfoLabel>
              <InfoValue>{formatFileSize(model.fileSize)}</InfoValue>
            </InfoRow>
          ) : null}

          {model.modelName ? (
            <InfoRow>
              <InfoLabel>
                <IconHash size={16} strokeWidth={2} />
                Name
              </InfoLabel>
              <InfoValue>{model.modelName}</InfoValue>
            </InfoRow>
          ) : null}

          {model.id && model.id.length > 2 ? (
            <InfoRow>
              <InfoLabel>
                <IconHash size={16} strokeWidth={2} />
                ID
              </InfoLabel>
              <InfoValue>
                <HashChip>
                  {abbreviateAddress(model.id, 6)}
                  <CopyIcon onClick={() => copyId()}>
                    <IconCopy size={14} />
                  </CopyIcon>
                </HashChip>
              </InfoValue>
            </InfoRow>
          ) : null}

          {visibleTags.length > 0 ? (
            <InfoRow>
              <InfoLabel>
                <IconTag size={16} strokeWidth={2} />
                Tags
              </InfoLabel>
              <TagRow>
                {visibleTags.map((tag, index) => (
                  <Tag key={index}>{tag}</Tag>
                ))}
              </TagRow>
            </InfoRow>
          ) : null}
        </InfoSection>
      </CardBody>
    </Card>
  );
}


function PinnedFilesTable({
  pinnedFiles,
  toasts,
  unpinFile
}: any) {
  return (
    <Grid>
      {pinnedFiles?.length ?
        pinnedFiles.map(x => (
          <ModelCard key={x.fileCIDHash} model={x} toasts={toasts} unpinFile={unpinFile} />
        )) :
        <EmptyState>
          <IconBoxOff size={36} strokeWidth={1.5} />
          <div>No pinned files found</div>
        </EmptyState>
      }
    </Grid>
  );
}

export default PinnedFilesTable;
