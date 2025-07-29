import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Import test functions for browser console debugging
import './utils/test-ip-detection'

createRoot(document.getElementById("root")!).render(<App />);
