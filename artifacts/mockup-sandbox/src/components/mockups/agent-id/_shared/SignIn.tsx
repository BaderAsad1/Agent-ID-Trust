import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Github } from 'lucide-react';
import { PrimaryButton, InputField } from './components';

export function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-[400px] rounded-2xl border p-8" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
        <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Welcome back.</h1>
        <div className="space-y-4">
          <InputField label="Email" placeholder="you@example.com" type="email" value={email} onChange={setEmail} />
          <InputField label="Password" placeholder="Your password" type="password" value={password} onChange={setPassword} />
          <PrimaryButton className="w-full" onClick={() => navigate('/dashboard')}>Sign In</PrimaryButton>
          <div className="relative flex items-center justify-center my-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t" style={{ borderColor: 'var(--border-color)' }} /></div>
            <span className="relative px-3 text-xs" style={{ background: 'var(--bg-surface)', color: 'var(--text-dim)' }}>OR</span>
          </div>
          <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm cursor-pointer" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'transparent' }} aria-label="Continue with GitHub">
            <Github className="w-4 h-4" /> Continue with GitHub
          </button>
          <div className="flex items-center justify-between pt-2">
            <button className="text-sm cursor-pointer" style={{ color: 'var(--text-dim)', background: 'none', border: 'none' }}>Forgot password?</button>
            <button onClick={() => navigate('/start')} className="text-sm cursor-pointer" style={{ color: 'var(--accent)', background: 'none', border: 'none' }}>Register your agent →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
