import React from 'react';
import { NavLink } from 'react-router-dom';
import styled from 'styled-components';
import { IconFileReport, IconMessage } from '@tabler/icons-react';
import { IconBuildingStore } from '@tabler/icons-react';
import { IconBrandStackshare } from '@tabler/icons-react';
import {
  IconWallet,
  IconPhoto,
  IconPackages,
  IconUsers,
} from '@tabler/icons-react';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  max-height: 10%;

  @media (min-width: 800px) {
    padding-left: 2.2rem;
  }
`;

const Button = styled(NavLink)`
  display: flex;
  min-height: 6rem;
  align-items: center;
  text-decoration: none;
  font-family: ${(p) => p.theme.fontUI};
  color: ${(p) => p.theme.colors.textSecondary};
  padding: 1.6rem;
  border-left: 2px solid transparent;
  transition:
    color ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard},
    border-color ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard},
    background-color ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard};

  &:hover {
    color: ${(p) => p.theme.colors.textPrimary};
    background-color: ${(p) => p.theme.colors.glassSurfaceHover};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: -2px;
  }

  &.active {
    color: ${(p) => p.theme.colors.brand};
    border-left-color: ${(p) => p.theme.colors.brand};
    background-color: ${(p) => p.theme.colors.glassSurfaceHover};
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const IconWrapper = styled.div`
  margin-right: 0.75rem;
  margin-left: 0.3rem;
  width: 3rem;
  opacity: 0.7;

  ${Button}.active & {
    opacity: 1;
  }
`;

// The collapsed rail is 7rem wide and clips its overflow, so a label rendered
// unconditionally showed up as a half-word — "W", "Ch", "Ag". A truncated word
// is worse than no word: it reads as a rendering bug. Stay fully hidden until
// the sidebar has actually expanded (on hover, or permanently at >=800px, where
// it is a fixed 250px), and fade in with the width so the text never appears
// mid-animation while it would still be cut off.
const Label = styled.span`
  opacity: 0;
  visibility: hidden;
  flex-grow: 1;
  text-align: left;
  /* HUD voice: uppercase, letter-spaced, monospace. */
  font-size: ${(p) => p.theme.type.xs};
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  padding-bottom: 2px;
  white-space: nowrap;
  transition:
    opacity ${(p) => p.theme.motion.duration.base} ${(p) =>
      p.theme.motion.easing.standard},
    visibility ${(p) => p.theme.motion.duration.base};

  ${({ parent }) => parent}:hover ${Button}.active & {
    opacity: 1;
    visibility: visible;
  }

  ${({ parent }) => parent}:hover & {
    opacity: 1;
    visibility: visible;
  }

  @media (min-width: 800px) {
    opacity: 1;
    visibility: visible;

    ${Button}.active & {
      opacity: 1;
      font-weight: 600;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const iconSize = '2rem';

export default function PrimaryNav({ parent, activeIndex, setActiveIndex }) {
  return (
    <Container>
      <Button
        onClick={() => setActiveIndex(0)}
        className={(navData) => (navData.isActive ? 'active-style' : 'none')}
        data-testid="wallet-nav-btn"
        to="/wallet"
      >
        <IconWrapper>
          <IconWallet width={iconSize} />
        </IconWrapper>
        <Label active={activeIndex === 0} parent={parent}>
          Wallet
        </Label>
      </Button>

      <Button onClick={() => setActiveIndex(1)} to="/chat">
        <IconWrapper>
          <IconMessage width={iconSize} />
        </IconWrapper>
        <Label active={activeIndex === 1} parent={parent}>
          Chat
        </Label>
      </Button>

      <Button onClick={() => setActiveIndex(2)} to="/models">
        <IconWrapper>
          <IconPackages width={iconSize} />
        </IconWrapper>
        <Label active={activeIndex === 2} parent={parent}>
          Models
        </Label>
      </Button>

      <Button onClick={() => setActiveIndex(3)} to="/agents">
        <IconWrapper>
          <IconUsers width={iconSize} />
        </IconWrapper>
        <Label active={activeIndex === 3} parent={parent}>
          Agents
        </Label>
      </Button>

      <Button onClick={() => setActiveIndex(4)} to="/providers">
        <IconWrapper>
          <IconBrandStackshare width={iconSize} />
        </IconWrapper>
        <Label active={activeIndex === 4} parent={parent}>
          Provider Hub
        </Label>
      </Button>
    </Container>
  );
}
