import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// 1) Import i18n config & provider
import './components/i18n'  // triggers i18n initialization
import { I18nextProvider } from 'react-i18next'
import i18n from './components/i18n' 

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* 2) Wrap <App /> with I18nextProvider */}
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </StrictMode>
)

