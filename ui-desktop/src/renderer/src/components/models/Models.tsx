import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import withModelsState from "../../store/hocs/withModelsState";
import { modelMatchesQuery } from '../chat/utils';

import { LayoutHeader } from '../common/LayoutHeader'
import { View } from '../common/View'
import { BtnAccent } from '../dashboard/BalanceBlock.styles';
import ModelsTable from './ModelsTable';
import Tab from 'react-bootstrap/Tab';
import Tabs from 'react-bootstrap/Tabs';
import styled from 'styled-components'
import FileSelectionModal from './FileSelectionModal';
import PinnedFilesTable from './PinnedFilesTable';
import { queryKeys } from '../../store/queries';


const Container = styled.div`
    overflow-y: auto;
    
    .nav-link {
        color: ${p => p.theme.colors.morMain}
    }

    .nav-link.active {
        color: ${p => p.theme.colors.morMain}
        border-color: ${p => p.theme.colors.morMain}
        background-color: rgba(0,0,0,0.4);
    }
`

const IpfsStatus = styled.div`
    color: ${p => p.theme.colors.morMain};
    font-size: 1.2rem;
`

const SearchRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 8px 0 4px;
`

const SearchInput = styled.input`
    flex: 1;
    height: 38px;
    background: rgba(0, 0, 0, 0.4);
    color: ${p => p.theme.colors.morMain};
    border: 1px solid ${p => p.theme.colors.morMain};
    border-radius: 5px;
    padding: 0 14px;
    font-size: 1.4rem;
    outline: none;
    ::placeholder { color: ${p => p.theme.colors.helpertextGray}; }
`

const ResultCount = styled.span`
    color: ${p => p.theme.colors.helpertextGray};
    font-size: 1.2rem;
    white-space: nowrap;
`

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
    const pinnedFiles = pinnedFilesQuery.data ?? [];

    const [search, setSearch] = useState('');
    const visibleModels = useMemo(
        () => models.filter((m: any) => modelMatchesQuery(m, search)),
        [models, search],
    );

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
            {isIpfsConnected ? (
                <IpfsStatus>
                    <span>IPFS Connected. Version: {ipfsVersion}</span>
                </IpfsStatus>
            ) : (
                <IpfsStatus>
                    <span>IPFS is not connected</span>
                </IpfsStatus>
            )}
            <LayoutHeader title="Models">
                <BtnAccent style={{ padding: '1.5rem' }} onClick={() => setOpenChangeModal(true)}>Pin Model</BtnAccent>
            </LayoutHeader>
            <SearchRow>
                <SearchInput
                    data-testid="models-search"
                    placeholder="Search models by name or tag…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <ResultCount>{visibleModels.length} / {models.length}</ResultCount>
            </SearchRow>
            <Container>
                <Tabs
                    defaultActiveKey="registry"
                    id="tab-models"
                    className="mb-3"
                >
                    <Tab eventKey="registry" title="Registry">
                        <ModelsTable setSelectedModel={setSelectedModel} models={visibleModels} openSelectDownloadFolder={openSelectDownloadFolder} toasts={toasts} client={client} config={config} />
                    </Tab>
                    <Tab eventKey="pinned" title="Pinned Models">
                        <PinnedFilesTable pinnedFiles={pinnedFiles} unpinFile={handleUnpinFile} toasts={toasts} />
                    </Tab>
                </Tabs>

            </Container>
            <FileSelectionModal
                isActive={openChangeModal}
                addFileToIpfs={addFileToIpfs}
                pinFile={onPinModel}
                toasts={toasts}
                handleClose={() => setOpenChangeModal(false)}
            />
        </View>)

}

export default withModelsState(Models);