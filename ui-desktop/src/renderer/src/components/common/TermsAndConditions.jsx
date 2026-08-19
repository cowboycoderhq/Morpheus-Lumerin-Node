import React from 'react';
import styled from 'styled-components';
import Markdown from 'marked-react';
// Inline the markdown at build time (?raw) instead of fetch()-ing the bundled
// asset at runtime. The packaged app loads over file://, where the strict CSP
// (connect-src 'self') blocks a fetch() of the file:// asset, leaving the terms
// box empty. Inlining sidesteps the fetch entirely — no CSP relaxation needed.
import termsContent from '../../termsAndConditions.md?raw';

const StyledTC = styled.div`
  text-align: justify;

  h1 {
    font-size: 1.5em;
  }
  h2 {
    font-size: 1.25em;
  }
  h3 {
    font-size: 1.1em;
  }
`;

const TermsAndConditions = () => {
  return (
    <StyledTC>
      <Markdown>{termsContent}</Markdown>
    </StyledTC>
  );
};

export default TermsAndConditions;
