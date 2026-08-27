import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Service worker disabled for now - can be re-enabled when push notifications are needed
// import { BASE_PATH } from './config'
// if ('serviceWorker' in navigator) {
//   window.addEventListener('load', () => {
//     navigator.serviceWorker.register(`${BASE_PATH || '/'}/sw.js`).then(
//       (registration) => {
//         console.log('ServiceWorker registration successful:', registration);
//       },
//       (error) => {
//         console.log('ServiceWorker registration failed:', error);
//       }
//     );
//   });
// }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
