import React, { useEffect, useRef, useState } from 'react';

import { withClient } from '../../store/hocs/clientContext';
import { DOCS_URL, SUPPORT_URL } from '../../client';
import { NavLink } from 'react-router-dom';
import styled from 'styled-components';
import { IconPlugConnected } from '@tabler/icons-react';
import { IconSettings } from '@tabler/icons-react';
import { IconHelp } from '@tabler/icons-react';
import { IconTools } from '@tabler/icons-react';
import { IconBook, IconBrandDiscord } from '@tabler/icons-react';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  max-height: 10%;
  font-family: ${(p) => p.theme.fontUI};
  color: ${(p) => p.theme.colors.textSecondary};
  padding-left: 0.5rem;
  @media (min-width: 800px) {
    padding-left: 2.2rem;
  }
`;

const Button = styled(NavLink)`
  display: flex;
  min-height: 6rem;
  align-items: center;
  text-decoration: none;
  color: ${(p) => p.theme.colors.textSecondary};
  padding: 1.6rem;
  border-left: 2px solid transparent;
  transition:
    color ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard},
    border-color ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard};

  &:hover {
    color: ${(p) => p.theme.colors.textPrimary};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: -2px;
  }

  &.active {
    color: ${(p) => p.theme.colors.brand};
    border-left-color: ${(p) => p.theme.colors.brand};
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const HelpLink = styled.span`
  display: flex;
  min-height: 7.1rem;
  align-items: center;
  text-decoration: none;
  color: ${(p) => p.theme.colors.textSecondary};
  padding: 1.6rem;
  cursor: pointer;
  transition: color ${(p) => p.theme.motion.duration.fast} ${(p) =>
    p.theme.motion.easing.standard};

  &:hover {
    color: ${(p) => p.theme.colors.textPrimary};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: -2px;
  }

  &.active {
    color: ${(p) => p.theme.colors.brand};
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

// Same as PrimaryNav: hidden until the rail is wide enough for the whole word,
// rather than clipped to "Se" / "He".
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
      font-weight: 700;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const NavHeader = styled.h3`
  color: ${(p) => p.theme.colors.textSecondary};
  padding-left: 2rem;
  text-transform: uppercase;
  font-size: ${(p) => p.theme.type.xs};
  @media (max-width: 800px) {
    display: none;
    ${({ parent }) => parent}:hover & {
      display: block;
    }
  }
`;

// The Help item opens a small menu rather than jumping straight to Discord.
// It sits at the very bottom of the sidebar, so the menu opens UPWARD.
const HelpWrapper = styled.div`
  position: relative;
`;

const HelpMenu = styled.div`
  position: absolute;
  bottom: calc(100% - 0.8rem);
  left: 1.2rem;
  z-index: 40;
  min-width: 190px;
  padding: 0.5rem;
  border-radius: ${(p) => p.theme.radii.md};
  background: ${(p) => p.theme.colors.primary};
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
  box-shadow: ${(p) => p.theme.shadows.elevated};
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const HelpMenuItem = styled.button`
  display: flex;
  align-items: center;
  gap: 0.9rem;
  width: 100%;
  padding: 0.9rem 1rem;
  border: none;
  border-radius: ${(p) => p.theme.radii.sm};
  background: transparent;
  color: ${(p) => p.theme.colors.textPrimary};
  font-family: inherit;
  font-size: 1.35rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;

  svg {
    color: ${(p) => p.theme.colors.brand};
    flex-shrink: 0;
  }

  &:hover {
    background: rgba(94, 208, 255, 0.12);
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: -2px;
  }
`;

const iconSize = '2rem';

function SecondaryNav({
  parent,
  client: { onLinkClick },
  activeIndex,
  setActiveIndex,
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef(null);

  // Close on outside click / Escape — a menu you cannot dismiss is a trap.
  useEffect(() => {
    if (!helpOpen) return undefined;
    const onDocClick = (e) => {
      if (helpRef.current && !helpRef.current.contains(e.target)) {
        setHelpOpen(false);
      }
    };
    const onKey = (e) => e.key === 'Escape' && setHelpOpen(false);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [helpOpen]);

  const open = (url) => {
    onLinkClick(url);
    setHelpOpen(false);
  };

  return (
    <Container>
      {/* <NavHeader parent={parent}>Tools</NavHeader>
      <Button
        onClick={() => setActiveIndex(4)}
        data-testid="auction-nav-btn"
        to="/sockets"
      >
        <IconWrapper>
          <IconPlugConnected width={iconSize} />
        </IconWrapper>
        <Label parent={parent}>Connections</Label>
      </Button>
      <Button
        onClick={() => setActiveIndex(5)}
        to="/devices"
      >
        <IconWrapper>
          <IconCpu2 width={iconSize} />
        </IconWrapper>
        <Label parent={parent}>Devices</Label>
      </Button>
       */}
      <Button
        onClick={() => setActiveIndex(5)}
        // className={(navData) => (navData.isActive ? "active-style" : 'none')}
        data-testid="tools-nav-btn"
        parent={parent}
        to="/settings"
      >
        <IconWrapper parent={parent}>
          <IconSettings width={iconSize} />
        </IconWrapper>
        <Label parent={parent}>Settings</Label>
      </Button>
      <HelpWrapper ref={helpRef}>
        {helpOpen && (
          <HelpMenu role="menu" data-testid="help-menu">
            <HelpMenuItem
              role="menuitem"
              data-testid="help-docs-btn"
              onClick={() => open(DOCS_URL)}
            >
              <IconBook size={18} stroke={2} />
              Documentation
            </HelpMenuItem>
            <HelpMenuItem
              role="menuitem"
              data-testid="help-discord-btn"
              onClick={() => open(SUPPORT_URL)}
            >
              <IconBrandDiscord size={18} stroke={2} />
              Discord
            </HelpMenuItem>
          </HelpMenu>
        )}
        <HelpLink
          data-testid="help-nav-btn"
          role="button"
          tabIndex={0}
          aria-haspopup="menu"
          aria-expanded={helpOpen}
          onClick={() => setHelpOpen((v) => !v)}
          onKeyDown={(e) =>
            (e.key === 'Enter' || e.key === ' ') && setHelpOpen((v) => !v)
          }
        >
          <IconWrapper parent={parent}>
            <IconHelp width={iconSize} />
          </IconWrapper>
          <Label parent={parent}>Help</Label>
        </HelpLink>
      </HelpWrapper>
    </Container>
  );
}

export default withClient(SecondaryNav);
