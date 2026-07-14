import { ReactNode, forwardRef } from 'react';
import styled from 'styled-components';

const FieldWithTitle = styled.div`
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`;

// Small uppercase label — matches the WizardChrome step-label convention
// (type.xs, wide tracking, muted secondary color) used across the Aurora
// system for "what is this value" captions.
const FieldTitle = styled.div`
  font-size: ${(p) => p.theme.type.xs};
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${(p) => p.theme.colors.textSecondary};
`;

const FieldValue = styled.div`
  font-size: ${(p) => p.theme.type.sm};
  color: ${(p) => p.theme.colors.textPrimary};
  text-wrap: nowrap;
`;

type FieldProps = {
  title: string;
  children: ReactNode;
};

export const Field = forwardRef<HTMLDivElement, FieldProps>((props, ref) => (
  <FieldWithTitle>
    <FieldTitle>{props.title}</FieldTitle>
    <FieldValue ref={ref}>{props.children}</FieldValue>
  </FieldWithTitle>
));
