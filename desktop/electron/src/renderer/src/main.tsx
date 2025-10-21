import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'

const root = document.getElementById('app')!
createRoot(root).render(<App />)
