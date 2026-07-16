import React from 'react';
import styled from 'styled-components';

const calcWidth = n => 100 / n;

const Container = styled.div`
  display: flex;
  justify-content: start;
  width: 100%;
`;

const Tab = styled.button`
  border-radius: ${(p) => p.theme.radii.md};
  width: ${calcWidth(3)}%;
  font: inherit;
  line-height: 1.2rem;
  font-size: 1.2rem;
  font-weight: bold;
  color: ${p => p.theme.colors.brand};
  letter-spacing: 1.4px;
  text-align: center;
  opacity: ${p => (p.isActive ? '1' : '0.5')};
  padding: 1.6rem 1rem;
  min-height: 40px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-decoration: ${p => (p.isActive ? 'underline' : 'none')};
  margin-bottom: 1px;
  transition: opacity ${p => p.theme.motion.duration.base} ${p =>
    p.theme.motion.easing.standard};

  &:focus-visible {
    outline: 2px solid ${p => p.theme.colors.secondaryLight};
    outline-offset: 2px;
  }

  @media (min-width: 800px) {
    width: ${calcWidth(3)}%;
    font-size: 1.4rem;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export default function Filter({ onFilterChange, activeFilter }) {
  // static propTypes = {
  //   onFilterChange: PropTypes.func.isRequired,
  //   activeFilter: PropTypes.oneOf([
  //     'converted',
  //     'received',
  //     'auction',
  //     'ported',
  //     'sent',
  //     ''
  //   ]).isRequired
  // }

  return (
    <Container>
      <Tab isActive={activeFilter === ''} onClick={() => onFilterChange('')}>
        All
      </Tab>
      <Tab
        isActive={activeFilter === 'sent'}
        onClick={() => onFilterChange('sent')}
      >
        Sent
      </Tab>
      <Tab
        isActive={activeFilter === 'received'}
        onClick={() => onFilterChange('received')}
      >
        Received
      </Tab>
    </Container>
  );
}
