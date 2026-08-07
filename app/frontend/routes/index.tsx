import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import HomePage from '../pages/home';
import LoginPage from '../pages/login';
import AdminUsersPage from '../pages/admin/users';
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
      </Routes>
    </Router>
  )
}

export default AppRoutes;
