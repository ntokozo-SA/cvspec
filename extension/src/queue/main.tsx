import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueuePage } from './QueuePage'
import './queue.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueuePage />
  </StrictMode>,
)
