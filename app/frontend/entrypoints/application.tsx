import { createRoot } from 'react-dom/client';
import { App } from '../App';
import { Provider } from 'react-redux';
import { store } from '../state/store';

const container = document.getElementById('root');

if(container) {
  const root = createRoot(container);
  root.render(
    <Provider store={store}>
      <App />
    </Provider>
  )
}
