import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import HomePage from '../pages/home';
import LoginPage from '../pages/login';
import AdminUsersPage from '../pages/admin/users';
import ForgotPasswordPage from '../pages/forgot-password';
import ResetPasswordPage from '../pages/reset-password';
import ProtectedRoute from '../components/ProtectedRoute';

const AppRoutes: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path='/' element={
          <ProtectedRoute>
            <HomePage/>
          </ProtectedRoute>
        } />
        <Route path='/admin/users' element={
          <ProtectedRoute>
            <AdminUsersPage/>
          </ProtectedRoute>
        } />
        <Route path='/login' element={<LoginPage/>} />
        <Route path='/forgot-password' element={<ForgotPasswordPage/>} />
        <Route path='/reset-password' element={<ResetPasswordPage/>} />
      </Routes>
    </Router>
  )
}

export default AppRoutes;
