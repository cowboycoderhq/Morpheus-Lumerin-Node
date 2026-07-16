import { useState } from 'react'
import styled from 'styled-components'

import withLoginState from '../store/hocs/withLoginState'

import { TextInput, AltLayout, BaseBtn, Sp, AltLayoutNarrow } from './common'

const LoginBtn = styled(BaseBtn)`
  font-size: 1.5rem;
  font-weight: bold;
  height: 40px;
  border-radius: ${(p) => p.theme.radii.md};
  /* Was a solid bright-cyan slab — the only one left. Same grammar as every
     other HUD control: a tinted panel with a hairline. */
  color: ${(p) => p.theme.colors.textPrimary};
  background-color: ${(p) => p.theme.colors.brandTint(0.1)};
  border: 1px solid ${(p) => p.theme.colors.glassBorderBright};

  &:hover,
  &:focus {
    color: ${(p) => p.theme.colors.brandBright};
    background-color: ${(p) => p.theme.colors.brandTint(0.2)};
    box-shadow: 0 0 16px ${(p) => p.theme.colors.brandTint(0.22)};
  }

  @media (min-width: 1040px) {
    margin-left: 0;
    margin-top: 1.6rem;
  }
`

const SecondaryBtn = styled(BaseBtn)`
  font-size: 1.2rem;
  color: ${(p) => p.theme.colors.dark};
  :hover {
    opacity: 0.75;
  }
`

// Setting up a new wallet is DESTRUCTIVE (it erases this device's wallet —
// only the Recovery Phrase brings it back), so it never fires from a single
// click: the first click swaps in this warning panel, and only an explicit
// second click erases. Same pattern as the simple-version account reset.
const ConfirmPanel = styled.div`
  padding: 1.4rem 1.6rem;
  border-radius: ${(p) => p.theme.radii.md};
  border: 1px solid ${(p) => p.theme.colors.danger};
  background: ${(p) => p.theme.colors.dangerTint(0.08)};
  color: ${(p) => p.theme.colors.textPrimary};
  font-size: 1.3rem;
  line-height: 1.5;
  text-align: left;
`

const ConfirmActions = styled.div`
  display: flex;
  gap: 1.2rem;
  margin-top: 1.2rem;
  justify-content: flex-end;
`

const DangerBtn = styled(BaseBtn)`
  font-size: 1.2rem;
  font-weight: 600;
  padding: 0.7rem 1.2rem;
  border-radius: ${(p) => p.theme.radii.md};
  border: 1px solid ${(p) => p.theme.colors.danger};
  color: ${(p) => p.theme.colors.danger};

  :hover {
    background: ${(p) => p.theme.colors.dangerTint(0.15)};
  }
`

const KeepBtn = styled(BaseBtn)`
  font-size: 1.2rem;
  padding: 0.7rem 1.2rem;
  border-radius: ${(p) => p.theme.radii.md};
  border: 1px solid ${(p) => p.theme.colors.glassBorderBright};
  color: ${(p) => p.theme.colors.textPrimary};

  :hover {
    background: ${(p) => p.theme.colors.brandTint(0.12)};
  }
`

function Login({ onInputChange, onSubmit, password, errors, status, error, logout }) {
  const [confirmingReset, setConfirmingReset] = useState(false)

  return (
    <AltLayout title="Enter your password">
      <AltLayoutNarrow>
        <form onSubmit={onSubmit} data-testid="login-form">
          <Sp mt={4}>
            <TextInput
              id="password"
              type="password"
              label="Password"
              value={password}
              data-testid="pass-field"
              autoFocus
              onChange={onInputChange}
              error={errors.password || error}
            />
          </Sp>
          <Sp mt={2}>
            {confirmingReset ? (
              <ConfirmPanel data-testid="reset-confirm-panel">
                Setting up a new wallet erases the one on this device — the
                only way to restore it afterwards is its Recovery Phrase.
                <ConfirmActions>
                  <KeepBtn
                    type="button"
                    data-testid="reset-cancel-btn"
                    onClick={() => setConfirmingReset(false)}
                  >
                    Keep my wallet
                  </KeepBtn>
                  <DangerBtn
                    type="button"
                    data-testid="reset-confirm-btn"
                    onClick={() => logout({})}
                  >
                    Erase and set up new
                  </DangerBtn>
                </ConfirmActions>
              </ConfirmPanel>
            ) : (
              <SecondaryBtn
                type="button"
                data-testid="create-new-account-btn"
                onClick={() => setConfirmingReset(true)}
                block
              >
                Or setup new wallet
              </SecondaryBtn>
            )}
          </Sp>
          <Sp mt={4}>
            <LoginBtn block submit disabled={status === 'pending'}>
              Login
            </LoginBtn>
          </Sp>
        </form>
      </AltLayoutNarrow>
    </AltLayout>
  )
}

export { Login }
export default withLoginState(Login)
