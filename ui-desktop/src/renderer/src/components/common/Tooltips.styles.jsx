import styled, { createGlobalStyle, keyframes } from 'styled-components';
import 'react-hint/css/index.css';

export const GlobalStyles = createGlobalStyle`
  .react-hint {
    &:after { display: none !important; }
  }
`;

const trans = keyframes`
  from { transform: translateY(-10px); }
  to { transform: translateY(-5px); }
`;

// The tooltip used to be a SOLID brand-blue slab with white text — the one
// bright-blue surface left in the app, and it read as a button rather than a
// hint. It now wears the composer's treatment (Chat.styles Composer): dark
// surface, white text, a blue ring. Its payload is almost always DATA (a session
// id, an address), so it is mono, per the design rule.
export const Container = styled.div`
  animation: 0.5s ${trans};
  animation-fill-mode: forwards;
  background-color: ${p => p.theme.colors.primary};
  max-width: ${p => p.maxWidth || 'auto'};
  font-family: ${p => p.theme.fontMono};
  font-size: 1.3rem;
  padding: 8px 12px;
  border-radius: ${(p) => p.theme.radii.md};
  border: 1px solid ${p => p.theme.colors.brand};
  box-shadow: 0 0 0 3px rgba(94, 208, 255, 0.12);
  position: relative;
  color: ${p => p.theme.colors.textPrimary};

  /* The arrow is two stacked triangles: the outer one paints the ring, the inner
     one the surface — otherwise a bordered bubble grows a borderless spike. */
  &:after {
    content: '';
    width: 0;
    height: 0;
    margin: auto;
    display: block;
    position: absolute;
    top: auto;
    bottom: -5px;
    left: 0;
    right: 0;
    border: 5px solid transparent;
    z-index: 2;
    border-bottom: none;
    border-top-color: ${p => p.theme.colors.primary};
  }

  &:before {
    content: '';
    width: 0;
    height: 0;
    margin: auto;
    display: block;
    position: absolute;
    top: auto;
    bottom: -6px;
    left: 0;
    right: 0;
    border: 5px solid transparent;
    z-index: 1;
    border-bottom: none;
    border-top-color: ${p => p.theme.colors.brand};
  }
`;

export const ContainerLocal = styled(Container)`
  display: ${p => (p.show ? 'block' : 'none')}
  position: absolute;
  left: 50%;
  transform: translate(-50%, -5px);
  white-space: pre;
  animation: 0.5s 
    ${keyframes`
    from { 
      transform: translate(-50%, -10px); 
      opacity: 0;
    }
    to { 
      transform: translate(-50%, -5px);
      opacity: 1;
    }
  `}
  bottom: calc(100% - 2em);
`;
