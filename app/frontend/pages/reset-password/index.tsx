import React from 'react';
import AuthLayout from '../../components/auth/AuthLayout';
import ResetPasswordForm from '../../components/auth/ResetPasswordForm';

const ResetPasswordPage: React.FC = () => (
  <AuthLayout>
    <ResetPasswordForm />
  </AuthLayout>
);

export default ResetPasswordPage;
