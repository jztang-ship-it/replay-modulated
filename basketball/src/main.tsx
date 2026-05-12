import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import * as Sentry from "@sentry/react";
import { initSentry } from "@shared/lib/sentry";
import { installChunkReloadHandler } from "@shared/lib/chunkReload";
initSentry('basketball', Sentry);
installChunkReloadHandler();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
