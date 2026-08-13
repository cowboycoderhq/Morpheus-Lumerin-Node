import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import PropTypes from 'prop-types';
import styled from 'styled-components';
import React from 'react';

import { ErrorMsg, Label } from './TextInput.styles';
import SelectorCaret from '../icons/SelectorCaret';

const MenuButton = styled(DropdownMenu.Trigger)`
  background-color: ${p => p.theme.colors.glassSurface};
  border: 1px solid ${p => p.theme.colors.glassBorder};
  color: ${p => p.theme.colors.textPrimary};
  font-family: ${p => p.theme.fontUI};
  font-size: ${p => p.theme.type.sm};
  font-weight: 600;
  letter-spacing: 0.5px;
  padding: 0;
  border-radius: ${p => p.theme.radii.md};
  display: flex;
  height: 4.8rem;
  text-align: left;
  width: 100%;
  line-height: 4rem;
  margin-top: 0.8rem;
  cursor: pointer;
  justify-content: space-between;
  align-items: center;
  transition: border-color ${p => p.theme.motion.duration.base} ${p =>
    p.theme.motion.easing.standard};
  border-color: ${p => (p.hasErrors ? p.theme.colors.danger : p.theme.colors.glassBorder)};

  &[disabled] {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &:focus {
    outline: none;
    border-color: ${p => {
      if (p.hasErrors) return p.theme.colors.danger;
      if (p.noFocus && p.value && p.value.length > 0) {
        return p.theme.colors.glassBorder;
      }
      return p.theme.colors.brand;
    }};
  }

  @media (min-height: 600px) {
    height: 5.6rem;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const ValueContainer = styled.div`
  padding: 0.8rem 1.6rem;
  flex-grow: 1;
`;

const CaretContainer = styled.div`
  background-color: transparent;
  padding: 1.6rem 1.2rem 1.6rem 1.3rem;
  svg {
    fill: ${p => p.theme.colors.textSecondary};
  }

  [aria-expanded='true'] & {
    svg {
      fill: ${p => p.theme.colors.brand};
    }
  }

  [disabled] & {
    opacity: 0.25;
  }
`;

const MenuList = styled(DropdownMenu.Content)`
  background-color: ${p => p.theme.colors.voidElevated};
  border: 1px solid ${p => p.theme.colors.glassBorder};
  border-radius: ${p => p.theme.radii.md};
  box-shadow: ${p => p.theme.shadows.elevated};
  width: var(--radix-dropdown-menu-trigger-width);
  overflow: hidden;
`;

const MenuItem = styled(DropdownMenu.Item)`
  border-radius: ${(p) => p.theme.radii.md};
  color: ${p => p.theme.colors.textPrimary};
  font-family: ${p => p.theme.fontUI};
  width: 100%;
  font-size: ${p => p.theme.type.sm};
  font-weight: 600;
  letter-spacing: 0.5px;
  padding: 1.2rem 1.6rem;
  cursor: pointer;

  &[data-highlighted] {
    background-color: ${p => p.theme.colors.glassSurfaceHover};
    color: ${p => p.theme.colors.brand};
    outline: none;
  }
`;

export default class Selector extends React.Component {
  static propTypes = {
    'data-testid': PropTypes.string,
    onChange: PropTypes.func.isRequired,
    options: PropTypes.arrayOf(
      PropTypes.shape({
        value: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired
      })
    ).isRequired,
    error: PropTypes.oneOfType([
      PropTypes.arrayOf(PropTypes.string),
      PropTypes.string
    ]),
    label: PropTypes.string.isRequired,
    value: PropTypes.string,
    id: PropTypes.string.isRequired
  };

  onChange = e => {
    this.props.onChange({ id: this.props.id, value: e.target.value });
  };

  render() {
    const { onChange, options, error, label, value, id, ...other } = this.props;

    const hasErrors = error && error.length > 0;
    const activeItem = options.find(item => item.value === value);

    return (
      <div>
        <Label hasErrors={hasErrors} htmlFor={id}>
          {label}
        </Label>
        <DropdownMenu.Root>
          <MenuButton {...other}>
            <ValueContainer>
              {activeItem ? activeItem.label : ''}{' '}
            </ValueContainer>
            <CaretContainer>
              <SelectorCaret />
            </CaretContainer>
          </MenuButton>
          <DropdownMenu.Portal>
            <MenuList sideOffset={0} align="start">
              {options.map(item => (
                <MenuItem
                  onSelect={() => onChange({ id, value: item.value })}
                  key={item.value}
                >
                  {item.label}
                </MenuItem>
              ))}
            </MenuList>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        {hasErrors && (
          <ErrorMsg data-testid={`${this.props['data-testid']}-error`}>
            {typeof error === 'string' ? error : error.join('. ')}
          </ErrorMsg>
        )}
      </div>
    );
  }
}
