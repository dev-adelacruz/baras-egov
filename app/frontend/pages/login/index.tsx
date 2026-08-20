import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/auth/AuthLayout';
import LoginForm from '../../components/auth/LoginForm';
import { TEXT_LINK } from '../../components/ui/linkStyles';
import { supportMailto } from '../../config/support';
import BrandMark from '../../components/ui/BrandMark';
import { ShieldCheck, UserCog, KeyRound, CheckCircle2 } from 'lucide-react';

// Statements about how access actually works, each verifiable in this
// codebase — not a feature list. The panel previously advertised analytics,
// uptime and "enterprise-grade JWT security" for a system that has none of
// them, which is the failure this replaces. Nothing goes here that the app
// cannot currently do.
const accessNotes = [
  { icon: UserCog, label: 'Accounts are issued by an administrator — there is no public sign-up' },
  { icon: ShieldCheck, label: 'What you can see is scoped to your office and barangay' },
  { icon: KeyRound, label: 'Forgotten passwords can be reset from this page' },
];

/** The wide left-hand panel. Login is the only auth page that has one. */
const BrandPanel: React.FC = () => (
  // Green panel, orange accents — the seal's own arrangement: the field is
  // green, the sun and handshake on top of it are orange.
  // An even split, not 58/42. The panel is a dark gradient carrying a 36px
  // extrabold headline; the form is small, white and quiet. Giving the backdrop
  // the larger half as well made it win the squint test outright, which inverts
  // what this screen is for — the panel is context, signing in is the task.
  <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 overflow-hidden bg-gradient-to-br from-slate-950 via-accent-950 to-slate-950">
    {/* Animated orbs */}
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-accent-500/20 blur-3xl animate-float" />
      <div className="absolute -bottom-32 -right-32 w-[380px] h-[380px] rounded-full bg-brand-500/15 blur-3xl animate-float-delayed" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] rounded-full bg-accent-400/10 blur-3xl" />
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
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-500/20 border border-accent-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
          <span className="text-accent-300 text-xs font-semibold tracking-widest uppercase">Authorised staff only</span>
        </div>
        <h1 className="text-4xl font-extrabold text-white leading-[1.15] tracking-tight">
          Barangay records,<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-400 via-accent-300 to-brand-400">
            in one console.
          </span>
        </h1>
        <p className="text-slate-400 text-base leading-relaxed max-w-sm">
          The staff system for resident and account records. Sign in with the account issued to you.
        </p>
      </div>

      <div className="space-y-3">
        {accessNotes.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-800/60 border border-slate-700/50 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-accent-400" aria-hidden="true" />
            </div>
            <span className="text-slate-300 text-sm pt-1.5">{label}</span>
          </div>
        ))}
      </div>
    </div>

    {/* Bottom: standing advisory. Replaces a fabricated adoption figure and
        four invented coworker avatars — neither of which this system has any
        basis for, and both of which are a credibility problem on a government
        login page rather than a copy nit. */}
    <div className="relative z-10">
      <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
        Accounts are personal and must not be shared. Report a lost or compromised account to your
        administrator immediately.
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
          className="flex items-start gap-3 px-4 py-3 mb-6 rounded-xl bg-info-50 border border-info-200 text-info-700"
        >
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium">{notice}</p>
        </div>
      )}

      <LoginForm onSuccess={handleLoginSuccess} />

      {/* "Don't have an account?" was the wrong question — there is no public
          sign-up, so everyone reading this has one. And the control below it
          was a <button> with no handler: focusable, announced as actionable,
          and inert. With no support contact configured this is plain text, so
          nothing enters the tab order that cannot be acted on. */}
      <p className="mt-8 text-center text-sm text-slate-500">
        Trouble signing in?{' '}
        {supportMailto() ? (
          <a href={supportMailto() as string} className={TEXT_LINK}>
            Contact your administrator
          </a>
        ) : (
          <span className="font-semibold text-slate-700">
            Your barangay administrator issues and resets accounts.
          </span>
        )}
      </p>
    </AuthLayout>
  );
};

export default LoginPage;
