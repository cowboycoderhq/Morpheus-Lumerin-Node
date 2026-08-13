import styled from 'styled-components';

export const View = styled.div`
  /* The shell (Router's Main) clips its overflow, and this was a fixed 100vh
     box with no scroller of its own — so every page taller than the window
     (Settings, Models, ...) simply had its content cut off at the fold with no
     way to reach it. Own the scroll here: one fix for every page built on View.
     Chat deliberately does not use View — it has its own message scroller. */
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  max-width: 100%;
  min-width: 600px;
  position: relative;
  padding: 0 2.4rem;
  padding-top: 2rem;
  padding-bottom: 2.4rem;
  background: ${p => p.theme.colors.void};
  color: ${p => p.theme.colors.textPrimary};
  font-family: ${p => p.theme.fontUI};

  @media (min-width: 800px) {
  }

  @media (min-width: 1200px) {
  }
`;
