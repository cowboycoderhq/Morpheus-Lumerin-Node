import React, { useRef } from 'react';

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

  return (
    <ModalBase onClick={wrapClose} onMouseUp={handleMouseUp} ref={modalRef}>
      <Body
        {...bodyProps}
        onClick={e => e.stopPropagation()}
        onMouseDown={handleDialogMouseDown}
      >
        {CloseModal(e => wrapClose(e, true))}
        {children}
      </Body>
    </ModalBase>
  );
}

export default Modal;
