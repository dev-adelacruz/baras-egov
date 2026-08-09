import React from 'react';
import AuthLayout from '../../components/auth/AuthLayout';
import ForgotPasswordForm from '../../components/auth/ForgotPasswordForm';

const ForgotPasswordPage: React.FC = () => (
  <AuthLayout>
    <ForgotPasswordForm />
  </AuthLayout>
);

export default ForgotPasswordPage;
