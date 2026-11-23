import React from 'react';
import { useGame } from './context/GameContext';
import LoginScreen from './components/LoginScreen';
import TopBar from './components/TopBar';
import ChatPane from './components/ChatPane';
import RightDrawer from './components/RightDrawer';
import LightboxModal from './components/LightboxModal';

export default function App() {
  const { user, authLoading, statusToast, lightboxImage, setLightboxImage } = useGame();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0f1419] text-slate-200 flex items-center justify-center font-mono text-sm">
        <div className="flex items-center gap-3 px-5 py-3 rounded-lg bg-[#161d26] border border-slate-800">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
          INITIALIZING DE LAVAL ENGINE v7.2...
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="h-screen flex flex-col bg-[#0f1419] text-slate-100 overflow-hidden">
      <TopBar />

      {statusToast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg border text-xs font-mono shadow-xl ${
            statusToast.tone === 'error'
              ? 'bg-red-950/95 border-red-500/60 text-red-200'
              : statusToast.tone === 'warn'
              ? 'bg-amber-950/95 border-amber-500/60 text-amber-200'
              : 'bg-[#161d26] border-teal-500/50 text-teal-200'
          }`}
        >
          {statusToast.message}
        </div>
      )}

      <main className="flex-1 flex min-h-0 overflow-hidden">
        <section className="flex-1 flex flex-col min-w-0 border-r border-slate-800/80">
          <ChatPane />
        </section>
        <aside className="w-[380px] xl:w-[420px] shrink-0 bg-[#121820] flex flex-col min-h-0">
          <RightDrawer />
        </aside>
      </main>

      {lightboxImage && (
        <LightboxModal image={lightboxImage} onClose={() => setLightboxImage(null)} />
      )}
    </div>
  );
}
