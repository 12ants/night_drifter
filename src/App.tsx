/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import MapGame from './components/MapGame';
import { Key } from 'lucide-react';

export default function App() {
  const [token, setToken] = useState(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '');

  if (!token) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-200 flex items-center justify-center font-mono p-4">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 p-8 rounded-xl shadow-2xl relative overflow-hidden">
          {/* Subtle grid pattern background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
          
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mb-6 shadow-inner border border-neutral-700">
              <Key className="w-8 h-8 text-[#00e5ff]" />
            </div>
            
            <h1 className="text-2xl font-bold text-white tracking-tight mb-2">Mapbox Token Required</h1>
            <p className="text-neutral-400 text-sm mb-6 leading-relaxed">
              To render the 3D world with Mapbox GL JS, you need a public access token. 
              The application requires this to download maps, terrain, and building data.
            </p>

            <div className="w-full space-y-4">
              <div className="text-left">
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
                  Access Token
                </label>
                <input 
                  type="text" 
                  className="w-full bg-neutral-950 border border-neutral-800 text-neutral-200 text-sm rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#00e5ff]/50 focus:border-[#00e5ff] transition-all"
                  placeholder="pk.eyJ1..." 
                  onChange={(e) => setToken(e.target.value)}
                  autoFocus
                />
              </div>
              <p className="text-xs text-neutral-500 text-center">
                Configure <code className="bg-neutral-800 px-1 py-0.5 rounded text-neutral-300">VITE_MAPBOX_ACCESS_TOKEN</code> in your environment to skip this step.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen overflow-hidden">
      <MapGame accessToken={token} />
    </div>
  );
}
