import styled from 'styled-components'
import React from 'react'

import Spinner from '../../common/Spinner'

const Container = styled.div`
  text-align: center;
  padding: 2.4rem;
`

const BigText = styled.div`
  margin-top: 1.2rem;
  line-height: 2rem;
  font-size: 1.6rem;
  font-weight: 600;
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
`

const SmallText = styled.div`
  margin-top: 0.4rem;
  line-height: 16px;
  font-size: 1.3rem;
  font-weight: 500;
  text-align: center;
  color: rgba(255, 255, 255, 0.38);
`

export default class ScanningTxPlaceholder extends React.Component {
  render() {
    return (
      <Container data-testid="scanning-placeholder">
        <Spinner size="21px" />
        <BigText>Rescanning your transactions…</BigText>
        <SmallText>Some transaction may not be visible yet.</SmallText>
      </Container>
    )
  }
}
