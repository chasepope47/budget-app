import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { SupabaseAuthProvider } from "./SupabaseAuthProvider.jsx";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SupabaseAuthProvider>
      <App />
    </SupabaseAuthProvider>
  </StrictMode>,
)
