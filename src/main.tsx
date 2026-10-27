import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/dm-sans';
import '@fontsource/libre-caslon-display';
import App from './App';
import './styles.css';
import './components/MobileLayout.css';
import './components/MobileComposer.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
