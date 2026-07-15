import { useState } from 'react'
import styled from 'styled-components'

import withLoginState from '../store/hocs/withLoginState'

import { TextInput, AltLayout, BaseBtn, Sp, AltLayoutNarrow } from './common'

const LoginBtn = styled(BaseBtn)`
  font-size: 1.5rem;
  font-weight: bold;
  height: 40px;
  border-radius: 2px;
  background-color: ${(p) => p.theme.colors.morMain};
  color: black;

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

const DangerBtn = styled(BaseBtn)`
  font-size: 1.4rem;
  font-weight: bold;
  height: 40px;
  border-radius: 2px;
  background-color: ${(p) => p.theme.colors.tertiary};
  color: white;
  :hover {
    opacity: 0.85;
  }
`

const ResetWarning = styled.div`
  color: ${(p) => p.theme.colors.tertiary};
  font-size: 1.2rem;
  line-height: 1.5;
  text-align: center;
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
          {!confirmingReset ? (
            <Sp mt={2}>
              <SecondaryBtn
                type="button"
                data-testid="create-new-account-btn"
                onClick={() => setConfirmingReset(true)}
                block
              >
                Or setup new wallet
              </SecondaryBtn>
            </Sp>
          ) : (
            <Sp mt={2}>
              <ResetWarning>
                Setting up a new wallet erases the current wallet from this
                device. If you have not saved its recovery phrase, its funds are
                lost forever.
              </ResetWarning>
              <Sp mt={2}>
                <DangerBtn
                  type="button"
                  data-testid="reset-confirm-btn"
                  onClick={() => logout({})}
                  block
                >
                  Erase and set up new
                </DangerBtn>
              </Sp>
              <Sp mt={1}>
                <SecondaryBtn
                  type="button"
                  data-testid="reset-cancel-btn"
                  onClick={() => setConfirmingReset(false)}
                  block
                >
                  Keep my wallet
                </SecondaryBtn>
              </Sp>
            </Sp>
          )}
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
