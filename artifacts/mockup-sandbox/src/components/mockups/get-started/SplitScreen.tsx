import React from 'react';
import { CheckCircle2, Bot, Link2, ArrowRight } from 'lucide-react';

export function SplitScreen() {
  return (
    <div className="min-h-screen flex flex-row bg-[#0c0c14]">
      {/* LEFT PANEL */}
      <div 
        className="w-[40%] min-h-screen flex flex-col justify-between"
        style={{
          background: 'linear-gradient(to bottom right, #0d0d20, #0f1035)',
          padding: '48px 40px',
          position: 'relative'
        }}
      >
        {/* Grid pattern overlay */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}
        />
        
        {/* TOP SECTION */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-[36px] h-[36px] bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center">
               <div className="w-3 h-3 bg-white rounded-sm rotate-45" />
            </div>
            <span className="font-semibold text-white text-lg tracking-tight">Agent ID</span>
          </div>

          <h1 className="mt-12 text-[26px] font-bold text-white leading-tight">
            Identity infrastructure for AI agents.
          </h1>
          <p className="mt-4 text-sm text-zinc-400 leading-relaxed">
            Give your AI agent a verified name, trust score, and wallet — ready for the open agent economy.
          </p>

          <div className="mt-10 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={16} className="text-blue-400" />
              <span className="text-sm text-zinc-300">Verified identity on Base blockchain</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 size={16} className="text-blue-400" />
              <span className="text-sm text-zinc-300">SOC 2 Type II audit in progress</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 size={16} className="text-blue-400" />
              <span className="text-sm text-zinc-300">1,200+ agents already registered</span>
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION */}
        <div className="relative z-10 mt-auto">
          <div className="text-[11px] text-zinc-600 uppercase tracking-widest">
            Trusted by teams building the agentic web
          </div>
          <div className="mt-3 flex gap-3">
            <div className="w-16 h-5 rounded bg-zinc-800" />
            <div className="w-16 h-5 rounded bg-zinc-800" />
            <div className="w-16 h-5 rounded bg-zinc-800" />
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div 
        className="w-[60%] min-h-screen bg-[#10101a] flex flex-col justify-center"
        style={{ padding: '48px 56px' }}
      >
        <div className="max-w-md w-full mx-auto lg:mx-0">
          <div className="text-[11px] font-medium text-blue-400 uppercase tracking-widest mb-2">
            Step 1 of 4
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            How do you want to begin?
          </h2>
          <p className="text-sm text-zinc-500 mb-8">
            You can always add more agents later.
          </p>

          <div className="flex flex-col gap-4 w-full">
            {/* CARD 1 */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 cursor-pointer flex items-center gap-4 hover:border-blue-500/30 hover:bg-zinc-900/60 transition-all group">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <Bot size={20} className="text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-white">Register a new agent</span>
                  <span className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                    Most popular
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  Choose a handle, get a claim token. Your agent self-activates.
                </p>
              </div>
              <ArrowRight size={16} className="text-zinc-600 group-hover:text-zinc-300 transition-colors" />
            </div>

            {/* CARD 2 */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 cursor-pointer flex items-center gap-4 hover:border-violet-500/30 hover:bg-zinc-900/60 transition-all group">
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                <Link2 size={20} className="text-violet-400" />
              </div>
              <div className="flex-1">
                <span className="font-semibold text-sm text-white">Link an existing agent</span>
                <p className="mt-1 text-xs text-zinc-400">
                  Already have an agent running? Give it an owner token to self-register.
                </p>
              </div>
              <ArrowRight size={16} className="text-zinc-600 group-hover:text-zinc-300 transition-colors" />
            </div>
          </div>

          <div className="mt-10">
            <span className="text-xs text-zinc-500">Already have an account? </span>
            <span className="text-xs text-blue-400 cursor-pointer hover:underline">Sign in</span>
          </div>
        </div>
      </div>
    </div>
  );
}
