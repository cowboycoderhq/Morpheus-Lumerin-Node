import React from 'react';
import { mount } from './_mount.jsx';
import { Login } from '../../../../src/renderer/src/components/Login.tsx';

window.__logout = 0;
mount(
  <Login
    onInputChange={() => {}}
    onSubmit={(e) => e.preventDefault()}
    password=""
    errors={{}}
    status=""
    error=""
    logout={() => { window.__logout++; }}
  />,
);
