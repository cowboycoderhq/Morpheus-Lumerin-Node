import React from 'react';

import { withClient } from '../../store/hocs/clientContext';
import { NavLink } from 'react-router-dom';
import styled from 'styled-components';
import { IconPlugConnected } from '@tabler/icons-react';
import { IconSettings } from '@tabler/icons-react';
import { IconHelp } from '@tabler/icons-react';
import { IconTools } from '@tabler/icons-react';

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

const iconSize = '2rem';

function SecondaryNav({
  parent,
  client: { onHelpLinkClick },
  activeIndex,
  setActiveIndex,
}) {
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
      <HelpLink
        data-testid="help-nav-btn"
        aria-label="Help"
        onClick={onHelpLinkClick}
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
