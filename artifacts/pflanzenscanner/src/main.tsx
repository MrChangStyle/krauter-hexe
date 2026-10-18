import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Ask the browser to keep our local data (queued photos, own scans) even when
// storage runs low. Without this, iOS Safari in particular may delete it.
// Fire and forget: the answer only matters to the browser.
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  void navigator.storage.persisted().then((already) => {
    if (!already) void navigator.storage.persist()
  }).catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
