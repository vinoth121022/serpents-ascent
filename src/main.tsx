import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { must } from './core';

createRoot(must(document.getElementById('root'), '#root missing')).render(<App />);
