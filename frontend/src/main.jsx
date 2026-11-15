import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '../speech/src/speech.css';
import '../camera/src/camera.css';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>,
);
