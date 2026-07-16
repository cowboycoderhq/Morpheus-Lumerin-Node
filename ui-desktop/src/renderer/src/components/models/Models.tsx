import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import withModelsState from "../../store/hocs/withModelsState";

import { IconPinned, IconSearch } from '@tabler/icons-react';
import { View } from '../common/View'
import ModelsTable from './ModelsTable';
import Tab from 'react-bootstrap/Tab';
import Tabs from 'react-bootstrap/Tabs';
import FileSelectionModal from './FileSelectionModal';
import PinnedFilesTable from './PinnedFilesTable';
import { queryKeys } from '../../store/queries';
import {
  HudPage,
  Scanlines,
  HudHeader,
  HudTitle,
  HudSubtitle,
  HudBtn,
  HudPanel,
  HudTabsWrap,
  StatusLine,
  Orb,
  SearchRow,
  SearchInput,
  ResultCount,
} from './hud.styles';
import { modelMatchesQuery } from '../chat/utils';


// The old page had TWO scrollers: this Container carried `overflow-y: auto`
// while the View around it scrolls as well, so the page could not scroll
// reliably — the wheel went to whichever box the pointer happened to be over.
// The HUD layout has ONE scroller (View), and no inner overflow at all.

const Models = ({
    setSelectedModel,
    getIpfsVersion,
    getAllModels,
    openSelectDownloadFolder,
    addFileToIpfs,
    getPinnedFiles,
    pinFile,
    unpinFile,
    toasts,
    client,
    config,
}: any) => {

    const [openChangeModal, setOpenChangeModal] = useState(false);
    const [search, setSearch] = useState('');
    const queryClient = useQueryClient();

    // Cached, stale-while-revalidate data so revisiting the Models tab renders
    // instantly and refreshes in the background instead of refetching on mount.
    const ipfsVersionQuery = useQuery({
        queryKey: queryKeys.ipfsVersion,
        queryFn: getIpfsVersion,
    });
    const modelsQuery = useQuery({
        queryKey: queryKeys.allModels,
        queryFn: getAllModels,
    });
    const pinnedFilesQuery = useQuery({
        queryKey: queryKeys.pinnedFiles,
        queryFn: getPinnedFiles,
    });

    const ipfsVersion = (ipfsVersionQuery.data as any)?.version ?? null;
    const isIpfsConnected = !!ipfsVersion;
    const models: any[] = (modelsQuery.data as any[]) ?? [];

    // Same token matcher the chat model picker uses, so a model is findable by
    // the same query in both places — "deepseek v4 pro" works, hyphens and all.
    const visibleModels = useMemo(
        () => models.filter((m: any) => modelMatchesQuery(m, search)),
        [models, search],
    );
    const pinnedFiles = pinnedFilesQuery.data ?? [];

    const reload = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.ipfsVersion });
        queryClient.invalidateQueries({ queryKey: queryKeys.allModels });
        queryClient.invalidateQueries({ queryKey: queryKeys.pinnedFiles });
    }

    const handleUnpinFile = async (hash) => {
        try {
            const response = await unpinFile(hash);
            if (response) {
                toasts.toast("success", "File unpinned successfully");
                queryClient.setQueryData(queryKeys.pinnedFiles, (old: any[] = []) =>
                    old.filter(
                        (file: any) =>
                            file.metadataCIDHash !== hash && file.fileCIDHash !== hash,
                    ),
                );
            } else {
                toasts.toast("error", "Failed to unpin file");
            }
        } catch (error) {
            toasts.toast("error", "Failed to unpin file");
            console.error("Error", error);
        }
    }

    const onPinModel = async (hash) => {
        const response = await pinFile(hash);
        reload();
        return response;
    }

    return (
    <View data-testid="models-container">
        <HudPage>
            <Scanlines />

            <HudHeader>
                <div>
                    <HudTitle>Models</HudTitle>
                </div>
                <HudBtn onClick={() => setOpenChangeModal(true)}>
                    <IconPinned size={16} stroke={1.75} /> Pin model
                </HudBtn>
            </HudHeader>

            <HudSubtitle>
                Models registered on the network, and the model files you are
                hosting on IPFS. Pinning fetches a model&apos;s files to your own
                node and keeps them there — the first step to serving it.
            </HudSubtitle>

            {/* The IPFS orb is the page's liveness signal: pinning fails
                outright when the node is down, so it is stated before anything
                that depends on it, not buried in a failed action. */}
            <StatusLine>
                <Orb $on={isIpfsConnected} />
                {isIpfsConnected
                    ? `IPFS online · v${ipfsVersion}`
                    : 'IPFS offline · pinning unavailable'}
            </StatusLine>

            <SearchRow>
                <IconSearch size={18} stroke={1.75} />
                <SearchInput
                    data-testid="models-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search models or tags…"
                    aria-label="Search models"
                />
                <ResultCount>
                    {visibleModels.length} / {models.length}
                </ResultCount>
            </SearchRow>

            <HudPanel>
                <HudTabsWrap>
                    <Tabs defaultActiveKey="registry" id="tab-models" className="mb-3">
                        <Tab eventKey="registry" title="Registry">
                            <ModelsTable setSelectedModel={setSelectedModel} models={visibleModels} openSelectDownloadFolder={openSelectDownloadFolder} toasts={toasts} client={client} config={config} />
                        </Tab>
                        <Tab eventKey="pinned" title="Pinned">
                            <PinnedFilesTable pinnedFiles={pinnedFiles} unpinFile={handleUnpinFile} toasts={toasts} />
                        </Tab>
                    </Tabs>
                </HudTabsWrap>
            </HudPanel>

            <FileSelectionModal
                isActive={openChangeModal}
                addFileToIpfs={addFileToIpfs}
                pinFile={onPinModel}
                toasts={toasts}
                handleClose={() => setOpenChangeModal(false)}
            />
        </HudPage>
    </View>)

}

export default withModelsState(Models);