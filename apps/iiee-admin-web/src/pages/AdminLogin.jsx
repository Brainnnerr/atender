import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import bgImage from '../assets/ESSU-LANDINGPAGE-BG.jpg';
import fcoLogo from '../assets/FCO-LOGOO.png';

export default function AdminLogin({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setLoading(true);

    try {
      // 1. Authenticate with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (authError) throw authError;

      // 2. Verify admin role in profiles table
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      if (profileError || profile?.role !== 'admin') {
        await supabase.auth.signOut();
        throw new Error('Access denied. This account does not have admin privileges.');
      }

      // 3. Trigger callback on successful admin auth
      if (onLoginSuccess) onLoginSuccess(authData.user);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to authenticate admin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden font-sans">
      {/* Background Image */}
      <img
        src={bgImage}
        alt="Campus Background"
        className="absolute inset-0 w-full h-full object-cover object-center select-none"
      />

      {/* Black Overlay */}
      <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" />

      {/* Split-Screen Layout */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center min-h-screen">
        
        {/* LEFT COLUMN: Logo & Atender System Branding */}
        <div className="flex flex-col items-center lg:items-start text-center lg:text-left text-white px-4">
          <div className="w-36 h-36 sm:w-48 sm:h-48 mb-6 drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)]">
            <img
              src={fcoLogo}
              alt="FCO Logo"
              className="w-full h-full object-contain filter drop-shadow-xl"
            />
          </div>

          <h1 className="text-4xl sm:text-6xl font-black tracking-widest text-white leading-tight drop-shadow-md">
            ATENDER <span className="text-[#ff4d4d]">SYSTEM</span>
          </h1>

          <p className="text-base sm:text-xl font-semibold text-slate-200 tracking-wider mt-3 uppercase">
            FCO - COLLEGE OF ENGINEERING
          </p>
        </div>

        {/* RIGHT COLUMN: Admin Sign-In Card */}
        <div className="flex justify-center lg:justify-end">
          <div className="w-full max-w-md bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
            
            <div className="p-8 sm:p-10">
              <div className="mb-6">
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#8b0000] bg-red-50 px-2.5 py-1 rounded-md">
                  Administrator Access
                </span>
                <h2 className="text-2xl font-black text-slate-900 mt-2">
                  SIGN IN TO DASHBOARD
                </h2>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  Enter your administrative credentials to continue.
                </p>
              </div>

              {errorMessage ? (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email Input */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@gmail.com"
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 focus:border-[#8b0000] transition duration-150"
                  />
                </div>

                {/* Password Input */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8b0000]/20 focus:border-[#8b0000] transition duration-150 pr-16"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#8b0000] hover:text-red-900 transition select-none"
                    >
                      {showPassword ? 'HIDE' : 'SHOW'}
                    </button>
                  </div>
                </div>

                {/* Login Action Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-[#8b0000] hover:bg-[#700000] active:scale-[0.99] disabled:opacity-50 text-white font-bold text-sm tracking-widest uppercase rounded-xl shadow-lg shadow-[#8b0000]/30 hover:shadow-none transition-all duration-200 cursor-pointer"
                >
                  {loading ? 'Authenticating...' : 'Access Dashboard'}
                </button>
              </form>

              {/* Sub-card Footer */}
              <div className="mt-8 pt-5 border-t border-slate-100 text-center">
                <p className="text-[11px] text-slate-400 font-medium">
                  BRAINERTECH
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}