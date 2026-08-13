import React, { useContext } from 'react';
import styled from 'styled-components';
import { ToastsContext } from '../toasts';
import { BaseBtn } from '.';
import { abbreviateAddress } from '../../utils';
import { IconCopy } from '@tabler/icons-react';

const Container = styled.header`
  padding: 1.6rem;
  display: flex;
  align-items: center;
  justify-content: flex-start;
`;

const AddressContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: ${p => p.theme.colors.glassSurface};
  border-radius: ${p => p.theme.radii.md};
  border: 1px solid ${p => p.theme.colors.glassBorder};
  padding: 0.5rem 1.25rem;
  color: ${p => p.theme.colors.textPrimary};

  svg {
    color: ${p => p.theme.colors.textSecondary};
    transition: color ${p => p.theme.motion.duration.fast} ${p =>
      p.theme.motion.easing.standard};
  }

  &:hover svg {
    color: ${p => p.theme.colors.brand};
  }

  @media (prefers-reduced-motion: reduce) {
    svg {
      transition: none;
    }
  }
`;

// Wallet address — data, not UI copy: always mono (design rule).
const Address = styled.div`
  font-family: ${p => p.theme.fontMono};
  font-size: ${p => p.theme.type.sm};
  cursor: default;
  font-weight: 600;
  text-overflow: ellipsis;
  overflow: hidden;
  max-width: 240px;
  @media (min-width: 960px) {
    max-width: 100%;
  }
`;

// >=40px hit target for the copy action (accessibility rule).
const CopyButton = styled(BaseBtn)`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  min-height: 40px;
  margin: -0.8rem;
  border-radius: ${p => p.theme.radii.md};
  color: inherit;

  &:hover {
    background: ${p => p.theme.colors.glassSurfaceHover};
  }
`;

export const AddressHeader = ({ copyToClipboard, address }) => {
  const context = useContext(ToastsContext);

  const onCopyToClipboardClick = () => {
    copyToClipboard(address);
    context.toast('info', 'Address copied to clipboard', {
      autoClose: 1500
    });
  };

  return (
    <Container className="sidebar-address">
      <AddressContainer>
        <Address data-testid="address">{abbreviateAddress(address, 5)}</Address>
        <CopyButton
          aria-label="Copy address to clipboard"
          onClick={onCopyToClipboardClick}
        >
          <IconCopy size={18} />
        </CopyButton>
      </AddressContainer>
    </Container>
  );
};
