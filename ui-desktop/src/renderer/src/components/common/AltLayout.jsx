import styled from 'styled-components'
import React from 'react'

import Flex from './Flex'
import Sp from './Spacing'

const Container = styled(Flex.Column)`
  min-height: 100vh;
  padding: 3.2rem;
  background: transparent;
  top: center;
`

const Body = styled.div`
  position: relative;
  background: ${(p) => p.theme.colors.brandTint(0.04)};
  border-width: 1px;
  border: 1px solid ${(p) => p.theme.colors.brandTint(0.22)};
  /* The card behind Login and every onboarding step — it had no radius at all,
     which is why those screens still showed hard corners. */
  border-radius: ${(p) => p.theme.radii.lg};
  padding: 3rem;
  max-width: 53rem;
  width: 100%;
  margin-top: 4rem;
  @media (min-height: 800px) {
    margin-top: 8rem;
  }
`

const BackButton = styled.button`
  position: absolute;
  left: 1.6rem;
  top: 1.6rem;
  background: transparent;
  border: none;
  color: ${(p) => p.theme.colors.dark};
  font-size: 2.4rem;
  line-height: 1;
  cursor: pointer;
  padding: 4px 10px;
  :hover {
    opacity: 0.7;
  }
`

const Title = styled.div`
  line-height: 3rem;
  font-size: 1.8rem;
  font-weight: bold;
  text-align: center;
  cursor: default;
  color: ${(p) => p.theme.colors.dark};
  @media (min-height: 600px) {
    font-size: 2.4rem;
  }
`

const LogoContainer = styled.div`
  padding-top: 80px;
  padding-bottom: 20px;
`

export default function AltLayout({ title, onBack, children, ...other }) {
  return (
    <Container align="center" {...other}>
      <LogoContainer>
        {/* <LumerinLogoFull height="80px" width="250px" /> */}
      </LogoContainer>
      <Body>
        {onBack && (
          <BackButton
            type="button"
            data-testid="onboarding-back-btn"
            aria-label="Go back"
            onClick={onBack}
          >
            ←
          </BackButton>
        )}
        {title && <Title>{title}</Title>}
        <Sp mt={2}>{children}</Sp>
      </Body>
    </Container>
  )
}
