import styled from 'styled-components';

// The app's ONE checkbox.
//
// `accent-color` alone only tints a checkbox once it is CHECKED — unchecked, the
// platform still paints its default white box with a blue focus ring, which
// looks pasted in from another application. Every checkbox in the app therefore
// goes through this component rather than styling a raw <input> in place.
//
// The native control is stripped (`appearance: none`) and redrawn on the Aurora
// surfaces, but it IS still a real <input type="checkbox">: keyboard-operable,
// screen-reader announced, and clickable via its <label>, all for free. A custom
// div-based "switch" would throw that away and have to reimplement it badly.
export const Checkbox = styled.input.attrs({ type: 'checkbox' })`
  appearance: none;
  -webkit-appearance: none;
  margin: 0;
  position: relative;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  cursor: pointer;
  border-radius: ${(p) => p.theme.radii.sm};
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
  background: ${(p) => p.theme.colors.glassSurface};
  transition:
    background ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard},
    border-color ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard};

  /* Hover is scoped to the UNCHECKED box on purpose. A hover rule written as
     :hover:not(:disabled) scores 0,3,0 against :checked's 0,2,0, so it wins on
     specificity and repaints a checked box with the empty-state background —
     the green fill disappears under the cursor and only the tick survives,
     which reads as "not checked" at exactly the moment the user is deciding. */
  &:hover:not(:disabled):not(:checked) {
    border-color: ${(p) => p.theme.colors.brand};
    background: ${(p) => p.theme.colors.glassSurfaceHover};
  }

  &:checked {
    background: ${(p) => p.theme.colors.brand};
    border-color: ${(p) => p.theme.colors.brand};
  }

  /* Checked + hovered stays unmistakably filled; it brightens rather than empties. */
  &:checked:hover:not(:disabled) {
    background: ${(p) => p.theme.colors.brand};
    border-color: ${(p) => p.theme.colors.brand};
    filter: brightness(1.15);
  }

  /* The tick is drawn, not a font glyph, so it cannot shift with the type stack. */
  &:checked::after {
    content: '';
    position: absolute;
    left: 0.65rem;
    top: 0.25rem;
    width: 0.5rem;
    height: 0.95rem;
    border: solid ${(p) => p.theme.colors.void};
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export default Checkbox;
