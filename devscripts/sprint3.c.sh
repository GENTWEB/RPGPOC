cat << 'EOF' > client/src/App.jsx
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
  const [sidebarHidden, setSidebarHidden] = useState(() => localStorage.getItem('dl_sidebar_hidden') === 'true');
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

        {!sidebarHidden && (
          <>
            <div
              onMouseDown={() => setDragging(true)}
              data-help-title="Resize Sidebar"
              data-help="Drag left or right to make your character sheet wider or narrower."
              className="w-1.5 cursor-col-resize bg-slate-800/80 hover:bg-amber-500/70 transition shrink-0"
              title="Drag to resize sidebar"
            />
            <aside
              style={{ width: `${sidebarWidth}px` }}
              className="shrink-0 bg-[#121820] flex flex-col min-h-0 border-l border-slate-800/60"
            >
              <RightDrawer />
            </aside>
          </>
        )}

        <button
          onClick={() => setSidebarHidden((v) => !v)}
          data-help-title="Toggle Character Drawer"
          data-help="Hide or show the Gear, Squad, Grid, and Lore sidebar for full-screen reading."
          title={sidebarHidden ? 'Show Character Sidebar' : 'Hide Character Sidebar'}
          className="fixed top-16 right-3 z-20 p-1.5 rounded-lg bg-[#161d26]/90 border border-slate-700 hover:border-amber-500 text-slate-300 shadow-lg"
        >
          {sidebarHidden ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
        </button>
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
EOF