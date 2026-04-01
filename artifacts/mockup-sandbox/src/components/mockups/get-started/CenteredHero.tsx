import React from 'react';
import { Bot, Link2 } from 'lucide-react';

export function CenteredHero() {
  return (
    <div className="min-h-screen bg-[#0c0c14] flex items-center justify-center font-sans">
      <div className="w-full max-w-[520px] px-6 py-12 flex flex-col items-center">
        
        {/* TOP */}
        <div className="flex flex-col items-center">
          <div 
            className="w-10 h-10 bg-gradient-to-br from-blue-500 to-violet-600 border border-white/20 shadow-sm flex items-center justify-center"
            style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
          />
          <div className="mt-4 text-[11px] font-semibold tracking-[0.2em] text-zinc-500 uppercase">
            Agent ID
          </div>
        </div>

        {/* HEADLINE */}
        <h1 className="mt-6 text-[32px] font-bold text-white text-center leading-tight tracking-tight">
          Your agent needs an identity.
        </h1>
        
        {/* SUBLINE */}
        <p className="mt-2 text-sm text-zinc-400 text-center">
          Register in 60 seconds. No credit card required.
        </p>

        {/* CARDS */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          {/* LEFT CARD */}
          <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 cursor-pointer hover:border-blue-500/40 hover:bg-zinc-900 transition-all text-left group">
            <div className="rounded-lg bg-blue-500/10 p-2 w-fit group-hover:bg-blue-500/20 transition-colors">
              <Bot size={20} className="text-blue-400" />
            </div>
            <h3 className="mt-3 font-semibold text-sm text-white group-hover:text-blue-400 transition-colors">
              Register a new agent
            </h3>
            <p className="mt-1 text-xs text-zinc-400 leading-relaxed flex-grow">
              Pick a handle like acme.agentid and get your claim token.
            </p>
            <div className="mt-3">
              <span className="text-[10px] font-medium text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full inline-block border border-blue-500/20">
                Most popular
              </span>
            </div>
          </div>

          {/* RIGHT CARD */}
          <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 cursor-pointer hover:border-violet-500/40 hover:bg-zinc-900 transition-all text-left group">
            <div className="rounded-lg bg-violet-500/10 p-2 w-fit group-hover:bg-violet-500/20 transition-colors">
              <Link2 size={20} className="text-violet-400" />
            </div>
            <h3 className="mt-3 font-semibold text-sm text-white group-hover:text-violet-400 transition-colors">
              Link an existing agent
            </h3>
            <p className="mt-1 text-xs text-zinc-400 leading-relaxed flex-grow">
              Already running an agent? Give it your owner token to self-register.
            </p>
          </div>
        </div>

        {/* STEP INDICATOR */}
        <div className="mt-8 flex flex-col items-center w-full">
          <div className="flex items-center gap-1.5 justify-center">
            <div className="w-6 h-1.5 rounded-full bg-blue-500"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-700"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-700"></div>
          </div>
          <div className="mt-2 text-[11px] text-zinc-500 text-center">
            Step 1 of 4
          </div>
        </div>

        {/* SOCIAL PROOF */}
        <div className="mt-8 text-xs text-zinc-500 text-center w-full">
          Join 1,200+ agents already on the network
        </div>
      </div>
    </div>
  );
}
