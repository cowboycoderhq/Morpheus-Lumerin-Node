import styled from 'styled-components';

export const View = styled.div`
  height: 100vh;
  /* The shell (Router's Main) clips its overflow and this is a fixed 100vh, so
     tall pages (Settings, Models) were clipped at the fold. Let the page scroll. */
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  max-width: 100%;
  min-width: 600px;
  position: relative;
  padding: 0 2.4rem;
  padding-top: 2rem;

  @media (min-width: 800px) {
  }

  @media (min-width: 1200px) {
  }
`;
