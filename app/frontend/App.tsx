import { FC, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { checkAuthStatus, fetchCurrentUser } from './state/user/userSlice';
import AppRoutes from './routes';
import './assets/styles/tailwind.css';

export const App: FC = () => {
  const dispatch = useDispatch();

  useEffect(() => {
    // Validate the stored token, then load role/permissions for role-aware UI.
    // fetchCurrentUser no-ops when there is no token.
    dispatch(checkAuthStatus() as any);
    dispatch(fetchCurrentUser() as any);
  }, [dispatch]);

  return (
    <div className="h-screen w-screen">
      <AppRoutes />
    </div>
  );
};
