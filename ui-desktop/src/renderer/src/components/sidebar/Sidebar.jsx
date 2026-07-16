import React, { useState } from 'react';
import styled from 'styled-components';

import SecondaryNav from './SecondaryNav';
import PrimaryNav from './PrimaryNav';

import { LumerinLogoFull } from '../icons/LumerinLogoFull';
import { AddressHeader } from '../common/AddressHeader';
import withSidebarState from '../../store/hocs/withSidebarState';

// Ambient chrome, not a money surface — glass/glow are allowed here (B1).
// Solid void-elevated base with a subtle glass sheen on top so the rail
// stays legibly distinct from page content in both the overlay (<800px)
// and docked (>=800px) layouts.
// A WHITE sheen (5%->2%) over a translucent panel is what made the rail read as
// a different, greyer material than the page it sits against — white lifts
// toward grey, not toward the HUD's blue. The rail is now the same panel colour
// as every other surface, lifted by a cyan hairline instead of by whitening it.
const Container = styled.div`
  background:
    linear-gradient(
      180deg,
      ${(p) => p.theme.colors.brandTint(0.04)},
      ${(p) => p.theme.colors.brandTint(0.01)}
    ),
    ${(p) => p.theme.colors.voidElevated};
  backdrop-filter: blur(12px);
  width: 7rem;
  padding-bottom: 4.5rem;
  display: flex;
  flex-direction: column;
  transition: width ${p => p.theme.motion.duration.base} ${p =>
    p.theme.motion.easing.standard};
  position: absolute;
  overflow: hidden;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 3;
  border-right: 1px solid ${p => p.theme.colors.glassBorder};

  .sidebar-address {
    display: none;
  }

  &:hover {
    width: 250px;
    box-shadow: ${p => p.theme.shadows.elevated};

    .sidebar-address {
      display: block;
    }
  }
  @media (min-width: 800px) {
    position: relative;
    min-width: 250px;
    width: 250px;

    .sidebar-address {
      display: block;
    }

    &:hover {
      box-shadow: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const FullLogoContainer = styled.div`
  padding: 4rem 2.2rem 2.8rem 2.2rem;
  height: 100px;
  display: none;
  flex-shrink: 0;

  ${({ parent }) => parent}:hover & {
    display: block;
  }
  @media (min-width: 800px) {
    display: block;
  }
`;

const IconLogoContainer = styled.div`
  padding: 40px 0.8rem 2rem 0.8rem;
  height: 100px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;

  ${({ parent }) => parent}:hover & {
    display: none;
  }
  @media (min-width: 800px) {
    display: none;
  }
`;

const NavContainer = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: column;
  height: 100%;
`;

const PrimaryNavContainer = styled.nav`
  flex-grow: 1;
  margin-top: 3rem;

  @media (max-width: 800px) {
    padding-left: 0.5rem;
  }
`;

// The divider above Settings/Help. It was a white hairline, which lifts toward
// grey for the same reason the sheen above was dropped — so it uses the panel
// hairline token and follows the accent instead of whitening the rail.
const SecondaryNavContainer = styled.nav`
  border-top: 1px solid ${(p) => p.theme.colors.glassBorder};
`;

function Sidebar(props) {
  const { address, copyToClipboard } = props;
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <Container data-testid="sidebar-rail">
      <FullLogoContainer parent={Container}>
        <LumerinLogoFull />
      </FullLogoContainer>

      <IconLogoContainer parent={Container}>
        <LumerinLogoFull />
      </IconLogoContainer>
      <NavContainer>
        <PrimaryNavContainer>
          <PrimaryNav
            parent={Container}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
          />
        </PrimaryNavContainer>

        <SecondaryNavContainer>
          <SecondaryNav
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            parent={Container}
          />
        </SecondaryNavContainer>
        <AddressHeader address={address} copyToClipboard={copyToClipboard} />
      </NavContainer>
    </Container>
  );
}

export default withSidebarState(Sidebar);
