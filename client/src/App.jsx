import React, { useState, useEffect } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useGame } from './context/GameContext';
import LoginScreen from './components/LoginScreen';
import TopBar from './components/TopBar';
import ChatPane from './components/ChatPane';
import RightDrawer from './components/RightDrawer';
import LightboxModal from './components/LightboxModal';
import HelpOverlay from './components/HelpOverlay';

export default function App() {
  const { user, authLoading, statusToast, lightboxImage, setLightboxImage, startNewCampaign } = useGame();
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem('dl_sidebar_w')) || 390);
  const [sidebarHidden, setSidebarHidden] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 1024) ? true : localStorage.getItem('dl_sidebar_hidden') === 'true');
  const [dragging, setDragging] = useState(false);
  const [inspectorActive, setInspectorActive] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('dl_sidebar_w', String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem('dl_sidebar_hidden', String(sidebarHidden));
  }, [sidebarHidden]);

  useEffect(() => {
    if (!dragging) return undefined;
    const onMove = (e) => {
      const nextWidth = Math.min(640, Math.max(280, window.innerWidth - e.clientX));
      setSidebarWidth(nextWidth);
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0f1419] text-slate-200 flex items-center justify-center font-mono text-sm">
        <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-[#161d26] border border-slate-800">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
          LOADING YOUR ENGINE...
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className={`h-screen flex flex-col bg-[#0f1419] text-slate-100 overflow-hidden ${inspectorActive ? 'cursor-help' : ''}`}>
      <TopBar
        inspectorActive={inspectorActive}
        onToggleInspector={() => setInspectorActive((v) => !v)}
        onOpenTutorial={() => setTutorialOpen(true)}
        sidebarHidden={sidebarHidden}
        onToggleSidebar={() => setSidebarHidden((v) => !v)}
      />

      {statusToast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl border text-xs font-mono shadow-2xl ${
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

      <main className="flex-1 flex min-h-0 overflow-hidden relative">
        <section className="flex-1 flex flex-col min-w-0">
          <ChatPane onOpenTutorial={() => setTutorialOpen(true)} />
        </section>

        {/* Desktop docked, drag-to-resize sidebar */}
        {!sidebarHidden && (
          <>
            <div
              onMouseDown={() => setDragging(true)}
              data-help-title="Resize Sidebar"
              data-help="Drag left or right to make your character sheet wider or narrower."
              className="hidden lg:block w-1.5 cursor-col-resize bg-slate-800/80 hover:bg-amber-500/70 transition shrink-0"
              title="Drag to resize sidebar"
            />
            <aside
              style={{ width: `${sidebarWidth}px` }}
              className="hidden lg:flex shrink-0 bg-[#121820] flex-col min-h-0 border-l border-slate-800/60"
            >
              <RightDrawer />
            </aside>
          </>
        )}

        {/* Mobile & tablet slide-over drawer */}
        {!sidebarHidden && (
          <div className="lg:hidden fixed inset-0 z-40 flex justify-end">
            <div
              className="fixed inset-0 bg-black/65 backdrop-blur-xs"
              onClick={() => setSidebarHidden(true)}
            />
            <aside className="relative z-50 w-[88vw] max-w-sm h-full bg-[#121820] border-l border-slate-700 flex flex-col shadow-2xl">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-[#0f1419]">
                <span className="text-xs font-mono text-amber-400 tracking-wider uppercase">Character Sheet</span>
                <button
                  onClick={() => setSidebarHidden(true)}
                  className="px-2 py-1 rounded text-xs font-mono bg-slate-800 text-slate-200 hover:bg-slate-700"
                >
                  Close ✕
                </button>
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                <RightDrawer />
              </div>
            </aside>
          </div>
        )}
      </main>

      {lightboxImage && (
        <LightboxModal image={lightboxImage} onClose={() => setLightboxImage(null)} />
      )}

      <HelpOverlay
        inspectorActive={inspectorActive}
        onCloseInspector={() => setInspectorActive(false)}
        tutorialOpen={tutorialOpen}
        onCloseTutorial={() => setTutorialOpen(false)}
        onSelectPreset={async (preset) => {
          localStorage.setItem('dl_preset_pitch', preset.pitch);
          await startNewCampaign(preset.mode);
        }}
      />
    </div>
  );
}
