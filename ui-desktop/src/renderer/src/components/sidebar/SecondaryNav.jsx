import React, { useState, useEffect, useRef } from 'react';

import { withClient } from '../../store/hocs/clientContext';
import { NavLink } from 'react-router-dom';
import styled from 'styled-components';
import { IconPlugConnected } from '@tabler/icons-react';
import { IconSettings } from '@tabler/icons-react';
import { IconHelp } from '@tabler/icons-react';
import { IconTools } from '@tabler/icons-react';
import { IconBrandDiscord, IconBook } from '@tabler/icons-react';

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

/* The Help choice. A popover rather than a modal: this is a two-item menu
 * hanging off a rail button, and a full-screen react-modal for "docs or people?"
 * would be heavier than the decision it asks for. Positioned relative to the
 * Container so it survives the collapsed rail. */
const HelpMenu = styled.div`
  position: absolute;
  bottom: 100%;
  left: 1.6rem;
  z-index: 10;
  min-width: 21rem;
  padding: 0.6rem;
  border-radius: 8px;
  background: ${(p) => p.theme.colors.voidElevated};
  border: 1px solid ${(p) => p.theme.colors.brandTint(0.28)};
`;

const HelpMenuItem = styled.button.attrs({ type: 'button' })`
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
  padding: 1rem 1.2rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: ${(p) => p.theme.colors.textPrimary};
  font-family: ${(p) => p.theme.fontUI};
  font-size: 1.4rem;

  &:hover,
  &:focus-visible {
    background: ${(p) => p.theme.colors.brandTint(0.12)};
  }
`;

const HelpMenuSub = styled.span`
  display: block;
  color: ${(p) => p.theme.colors.textSecondary};
  font-size: 1.2rem;
`;

const iconSize = '2rem';

function SecondaryNav({
  parent,
  client: { onDocsLinkClick, onDiscordLinkClick },
  activeIndex,
  setActiveIndex,
}) {
  // Help used to jump straight to the docs. A user who needs help wants either a
  // reference or a person, and only they know which — so offer both rather than
  // picking for them.
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef(null);

  // Dismiss on outside click / Escape. Without this the menu is a trap on a rail
  // whose only other controls navigate away.
  useEffect(() => {
    if (!helpOpen) return;
    const onDown = (e) => {
      if (helpRef.current && !helpRef.current.contains(e.target)) {
        setHelpOpen(false);
      }
    };
    const onKey = (e) => e.key === 'Escape' && setHelpOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [helpOpen]);

  const choose = (open) => {
    setHelpOpen(false);
    open();
  };

  return (
    <Container ref={helpRef} style={{ position: 'relative' }}>
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
      {/* aria-label for the same reason as PrimaryNav: the collapsed rail hides
          the visible <Label> with `visibility: hidden`, which takes it out of
          the accessibility tree, leaving the control unnamed. */}
      <Button
        onClick={() => setActiveIndex(5)}
        // className={(navData) => (navData.isActive ? "active-style" : 'none')}
        data-testid="tools-nav-btn"
        aria-label="Settings"
        parent={parent}
        to="/settings"
      >
        <IconWrapper parent={parent}>
          <IconSettings width={iconSize} />
        </IconWrapper>
        <Label parent={parent}>Settings</Label>
      </Button>
      {helpOpen && (
        <HelpMenu data-testid="help-menu" role="menu">
          <HelpMenuItem
            role="menuitem"
            data-testid="help-discord-btn"
            onClick={() => choose(onDiscordLinkClick)}
          >
            <IconBrandDiscord size={18} />
            <span>
              Discord
              <HelpMenuSub>Ask the community</HelpMenuSub>
            </span>
          </HelpMenuItem>
          <HelpMenuItem
            role="menuitem"
            data-testid="help-docs-btn"
            onClick={() => choose(onDocsLinkClick)}
          >
            <IconBook size={18} />
            <span>
              Documentation
              <HelpMenuSub>nodedocs.mor.org</HelpMenuSub>
            </span>
          </HelpMenuItem>
        </HelpMenu>
      )}
      <HelpLink
        data-testid="help-nav-btn"
        aria-label="Help"
        aria-haspopup="menu"
        aria-expanded={helpOpen}
        onClick={() => setHelpOpen((v) => !v)}
      >
        <IconWrapper parent={parent}>
          <IconHelp width={iconSize} />
        </IconWrapper>
        <Label parent={parent}>Help</Label>
      </HelpLink>{' '}
    </Container>
  );
}

export default withClient(SecondaryNav);
