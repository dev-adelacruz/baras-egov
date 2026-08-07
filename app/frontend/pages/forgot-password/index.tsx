import React from 'react';
import { Zap } from 'lucide-react';
import ForgotPasswordForm from '../../components/auth/ForgotPasswordForm';

const ForgotPasswordPage: React.FC = () => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-white px-8 py-12">
    <div className="flex items-center gap-2.5 mb-10">
      <div className="w-8 h-8 rounded-xl bg-teal-600 flex items-center justify-center">
        <Zap className="w-4 h-4 text-white" />
      </div>
      <span className="text-slate-900 text-base font-bold tracking-tight">AppName</span>
    </div>

    <div className="w-full max-w-sm">
      <ForgotPasswordForm />
    </div>
  </div>
);

export default ForgotPasswordPage;
