import React, { useRef } from 'react';
import { createPortal } from 'react-dom';

import {
  Modal as ModalBase,
  Body,
  CloseModal
} from './CreateContractModal.styles';

function Modal({ children, onClose, bodyProps }) {
  const waitingForMouseUpRef = useRef(false);
  const ignoreBackdropClickRef = useRef(false);
  const modalRef = useRef(false);
  const handleDialogMouseDown = () => {
    waitingForMouseUpRef.current = true;
  };
  const handleMouseUp = e => {
    if (waitingForMouseUpRef.current && e.target == modalRef.current) {
      ignoreBackdropClickRef.current = true;
    }
    waitingForMouseUpRef.current = false;
  };

  const wrapClose = (e, force) => {
    // `force` is the explicit close button. It must always close, regardless
    // of the backdrop guards below (the click target is the inner X icon, not
    // the button itself, so the `e.target !== e.currentTarget` check would
    // otherwise swallow it).
    if (force) {
      ignoreBackdropClickRef.current = false;
      onClose();
      return;
    }
    if (ignoreBackdropClickRef.current || e.target !== e.currentTarget) {
      ignoreBackdropClickRef.current = false;
      return;
    }
    onClose();
  };

  // Portal to <body>. The app shell's <Main> sets `isolation: isolate`
  // (Router.tsx) to keep a screen's overlays below the sidebar rail — which also
  // TRAPS anything rendered inside it. This modal was rendered inline, so its
  // z-index: 20 was scoped to Main's stacking context and the sidebar (z-index: 3,
  // a SIBLING of Main) painted straight over it. On a wide window you never
  // noticed; on a narrow one the centred modal slid under the rail and its left
  // edge — title, search box, filter pills — was covered.
  //
  // Router.tsx's own comment already assumes this ("In-page portals (modals,
  // toasts) mount on document.body and are unaffected"). Make that true.
  return createPortal(
    <ModalBase onClick={wrapClose} onMouseUp={handleMouseUp} ref={modalRef}>
      <Body
        {...bodyProps}
        onClick={e => e.stopPropagation()}
        onMouseDown={handleDialogMouseDown}
      >
        {CloseModal(e => wrapClose(e, true))}
        {children}
      </Body>
    </ModalBase>,
    document.body,
  );
}

export default Modal;
