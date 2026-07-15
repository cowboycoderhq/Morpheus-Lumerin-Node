import withOnboardingState from '../../store/hocs/withOnboardingState'
import PropTypes from 'prop-types'

import VerifyMnemonicStep from './VerifyMnemonicStep'
import CopyMnemonicStep from './CopyMnemonicStep'
import UserMnemonicStep from './UserMnemonicStep'
import PasswordStep from './PasswordStep'
import TermsStep from './TermsStep'
import { ImportFlow } from './ImportFlow'
import { SetCustomEthStep } from './SetCustomEthStep'
import { AltLayout, LoadingBar } from '../common'

const FinishingStep = () => (
  <AltLayout title="Setting up your wallet…">
    <LoadingBar />
  </AltLayout>
)

const Onboarding = (props) => {
  const page = () => {
    switch (props.currentStep) {
      case 'ask-for-terms':
        return <TermsStep {...props} />
      case 'define-password':
        return <PasswordStep {...props} />
      case 'copy-mnemonic':
        return <CopyMnemonicStep {...props} />
      case 'verify-mnemonic':
        return <VerifyMnemonicStep {...props} />
      case 'recover-from-mnemonic':
        return <UserMnemonicStep {...props} />
      case 'import-flow':
        return <ImportFlow {...props} />
      case 'set-custom-eth':
        return <SetCustomEthStep {...props} />
      default:
        // 'config-proxy-router' (and any unmapped step) lands here while the
        // wallet finishes provisioning — show a loading screen, not a blank page.
        return <FinishingStep />
    }
  }

  return <>{page()}</>
}

Onboarding.propTypes = {
  currentStep: PropTypes.oneOf([
    'recover-from-mnemonic',
    'define-password',
    'verify-mnemonic',
    'ask-for-terms',
    'copy-mnemonic',
    'import-flow',
    'set-custom-eth',
    'config-proxy-router'
  ]).isRequired
}

export default withOnboardingState(Onboarding)
