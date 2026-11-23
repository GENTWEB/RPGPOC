import React from 'react';
import { Shield, Sparkles, HardDrive } from 'lucide-react';
import { useGame } from '../context/GameContext';

export default function LoginScreen() {
  const { handleGoogleSignIn, busy } = useGame();

  return (
    <div className="min-h-screen bg-[#0f1419] text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-[#161d26] border border-slate-800 shadow-2xl p-8 space-y-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-xs">
            <Sparkles className="w-3.5 h-3.5" />
            DE LAVAL NARRATIVE RPG ENGINE v7.2
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Zero-Key Tactical Storytelling
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Sign in with Google to initialize your private Firestore vault, enable scoped Google Drive saves, and connect Gemini, Claude, or ChatGPT via OAuth PKCE.
          </p>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={busy}
          className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0f1419] font-semibold text-sm flex items-center justify-center gap-2.5 transition disabled:opacity-50"
        >
          <HardDrive className="w-4 h-4" />
          {busy ? 'Authenticating...' : 'Sign in with Google'}
        </button>

        <div className="pt-4 border-t border-slate-800 space-y-2.5 text-xs text-slate-400">
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
            <span>
              Minimal <code className="text-teal-300">drive.file</code> scope only — never reads unrelated Google Drive files.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
            <span>
              Zero raw API keys required. OAuth tokens remain strictly in HttpOnly, Secure, SameSite=Strict server vaults.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
