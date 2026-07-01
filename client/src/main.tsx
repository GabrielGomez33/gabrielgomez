import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/global.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* basename matches Vite `base` and the Apache alias (/GabrielGomez). */}
    <BrowserRouter basename="/GabrielGomez">
      <App />
    </BrowserRouter>
  </StrictMode>,
)
