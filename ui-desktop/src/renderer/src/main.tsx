// import './assets/main.css'
import ReactDOM from 'react-dom/client';
import App from './App';
import ReactModal from 'react-modal';
import { RootErrorBoundary } from './components/RootErrorBoundary';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}
// Wrapped at the ROOT, not per-screen. Without a boundary React unmounts the
// whole tree on any render throw, which does not look like an error — it looks
// like a freeze: last frame retained, timers gone, 0% CPU, nothing logged.
ReactDOM.createRoot(root).render(
  // <React.StrictMode>
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>,
  // </React.StrictMode>
);

ReactModal.setAppElement(root);
