import React from 'react';
import { mount, theme } from './_mount.jsx';
import ModelsTable from '../../../../src/renderer/src/components/models/ModelsTable.tsx';

const models = [
  { Id: '1', Name: 'deepseek-v4-pro', Tags: ['tee', 'reasoning', '70b'], IpfsCID: 'QmSecure123', metadataCIDHash: 'QmSecure123', modelName: 'deepseek-v4-pro' },
  { Id: '2', Name: 'llama_3_1_8b_instruct', Tags: ['general', '8b'], IpfsCID: 'QmNormal456', metadataCIDHash: 'QmNormal456', modelName: 'llama' },
];
mount(
  <div style={{ padding: 24, background: theme.colors.morLight }}>
    <ModelsTable models={models} setSelectedModel={() => {}} openSelectDownloadFolder={async () => null} toasts={{ toast: () => {} }} client={{}} config={{}} />
  </div>,
);
