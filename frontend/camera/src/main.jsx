import React from 'react';
import { createRoot } from 'react-dom/client';
import CameraPanel from './components/CameraPanel.jsx';
import '../../speech/src/speech.css';
import './camera.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <main className="speech-app">
      <header className="brand"><span className="brand-mark" aria-hidden="true">⠿</span> BrailleBridge</header>
      <CameraPanel />
      <footer className="app-footer">Built for conversations that connect.</footer>
    </main>
  </React.StrictMode>,
);
