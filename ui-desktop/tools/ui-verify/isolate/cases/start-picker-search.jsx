import React from 'react';
import { mount } from './_mount.jsx';
import StartPickerModal from '../../../../src/renderer/src/components/grok/StartPickerModal';

// The session picker's search box. It shipped with its typed text unstyled, so
// it fell through to Bootstrap's near-black on a near-black field: the search
// worked perfectly and was invisible while you used it. Nothing in a screenshot
// diff or a DOM assertion catches that — only the computed colour does.
//
// The modal fetches its catalog over IPC, which does not exist here; it fails
// into its error state, and the header (with the search box) renders regardless,
// which is all this case needs.
window.__done = [];

mount(
  <StartPickerModal
    open
    args=""
    onDone={(o) => window.__done.push(o)}
  />,
);
