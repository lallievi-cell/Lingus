import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/dm-sans';
import '@fontsource/libre-caslon-display';
import App from './App';
import './styles.css';
import './components/InterfaceTheme.css';
import './components/MobileLayout.css';
import './components/MobileComposer.css';
import './components/MobileVisual.css';
import './components/MobileComposition.css';
import './components/InterfacePolish.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
