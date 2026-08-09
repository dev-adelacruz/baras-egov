import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/auth/AuthLayout';
import LoginForm from '../../components/auth/LoginForm';
import BrandMark from '../../components/ui/BrandMark';
import { BarChart2, ShieldCheck, Users, Globe, CheckCircle2 } from 'lucide-react';

const features = [
  { icon: BarChart2, label: 'Real-time analytics & reporting' },
  { icon: ShieldCheck, label: 'Enterprise-grade JWT security' },
  { icon: Users, label: 'Role-based access control' },
  { icon: Globe, label: 'Global infrastructure & 99.9% uptime' },
];

/** The wide left-hand panel. Login is the only auth page that has one. */
const BrandPanel: React.FC = () => (
  <div className="hidden lg:flex lg:w-[58%] relative flex-col justify-between p-12 overflow-hidden bg-gradient-to-br from-slate-950 via-brand-950 to-slate-950">
    {/* Animated orbs */}
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-brand-500/20 blur-3xl animate-float" />
      <div className="absolute -bottom-32 -right-32 w-[380px] h-[380px] rounded-full bg-accent-500/15 blur-3xl animate-float-delayed" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] rounded-full bg-brand-400/10 blur-3xl" />
    </div>

    {/* Dot grid overlay */}
    <div
      className="absolute inset-0 pointer-events-none opacity-[0.07]"
      style={{
        backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }}
    />

    {/* Top: logo */}
    <div className="relative z-10">
      <BrandMark size="md" onDark />
    </div>

    {/* Middle: hero copy */}
    <div className="relative z-10 space-y-8">
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/20 border border-brand-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
          <span className="text-brand-300 text-xs font-semibold tracking-widest uppercase">Now with AI insights</span>
        </div>
        <h1 className="text-4xl font-extrabold text-white leading-[1.15] tracking-tight">
          Everything you need,<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 via-accent-300 to-success-400">
            in one platform.
          </span>
        </h1>
        <p className="text-slate-400 text-base leading-relaxed max-w-sm">
          Manage your team, track performance, and grow your business with powerful enterprise tools.
        </p>
      </div>

      <div className="space-y-3">
        {features.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-800/60 border border-slate-700/50 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-brand-400" aria-hidden="true" />
            </div>
            <span className="text-slate-300 text-sm">{label}</span>
          </div>
        ))}
      </div>
    </div>

    {/* Bottom: social proof */}
    <div className="relative z-10 flex items-center gap-4">
      <div className="flex -space-x-2">
        {['#0D9488', '#8B5CF6', '#06B6D4', '#F59E0B'].map((color, i) => (
          <div
            key={i}
            className="w-7 h-7 rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold text-white"
            style={{ backgroundColor: color }}
          >
            {['JD', 'AM', 'CK', 'TR'][i]}
          </div>
        ))}
      </div>
      <p className="text-slate-400 text-xs">
        Trusted by <span className="text-slate-200 font-semibold">10,000+</span> teams worldwide
      </p>
    </div>
  </div>
);

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice ?? null;

  const handleLoginSuccess = () => {
    navigate('/');
  };

  return (
    <AuthLayout aside={<BrandPanel />}>
      {notice && (
        // status, not alert — a success confirmation should wait for a
        // pause in speech rather than interrupt.
        <div
          role="status"
          className="flex items-start gap-3 px-4 py-3 mb-6 rounded-xl bg-success-50 border border-success-200 text-success-700"
        >
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium">{notice}</p>
        </div>
      )}

      <LoginForm onSuccess={handleLoginSuccess} />

      <p className="mt-8 text-center text-sm text-slate-500">
        Don't have an account?{' '}
        <button className="font-semibold text-brand-700 hover:text-brand-800 transition-colors duration-150">
          Contact your administrator
        </button>
      </p>
    </AuthLayout>
  );
};

export default LoginPage;
