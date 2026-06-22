import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { must } from './core';
import './ui/tailwind.css';

createRoot(must(document.getElementById('root'), '#root missing')).render(<App />);
