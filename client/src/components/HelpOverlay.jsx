import React, { useEffect, useState } from 'react';
import { HelpCircle, X, Compass, Sparkles } from 'lucide-react';
import { useGame } from '../context/GameContext';

const STARTER_PRESETS = [
  {
    title: 'Neon Trench Noir',
    mode: 'PSYCH_REALISM',
    pitch: 'Undersea noir city of glowing kelp forests, immortal detectives hiding as jazz musicians, and rumors of a mythical Surface World.',
  },
  {
    title: 'Classic Fantasy Tavern',
    mode: 'CLASSIC_D20',
    pitch: 'A cozy frontier tavern at the edge of ancient dwarven ruins, a missing trade caravan, and a waking dragon.',
  },
  {
    title: 'Orbital Arcane Survival',
    mode: 'CLASSIC_D20',
    pitch: 'Hard sci-fi deep-space survival where ancient rune-engraved wands are the only way to stabilize a failing fusion core.',
  },
];

export default function HelpOverlay({
  inspectorActive,
  onCloseInspector,
  tutorialOpen,
  onCloseTutorial,
  onSelectPreset,
}) {
  const [hoveredTip, setHoveredTip] = useState(null);
  const [tutStep, setTutStep] = useState(0);

  useEffect(() => {
    if (!inspectorActive) {
      setHoveredTip(null);
      return undefined;
    }

    const handleMove = (e) => {
      const el = e.target?.closest?.('[data-help], [title]');
      if (el) {
        const text = el.getAttribute('data-help') || el.getAttribute('title');
        const label = el.getAttribute('data-help-title') || el.innerText?.trim()?.slice(0, 32) || 'Control';
        if (text) {
          setHoveredTip({ label, text });
          return;
        }
      }
      setHoveredTip(null);
    };

    const handleKey = (e) => {
      if (e.key === 'Escape') onCloseInspector();
    };

    window.addEventListener('mouseover', handleMove);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mouseover', handleMove);
      window.removeEventListener('keydown', handleKey);
    };
  }, [inspectorActive, onCloseInspector]);

  const TUTORIAL_STEPS = [
    {
      title: '1. Pick Your AI Game Master',
      body: 'Use the GM menu at the top bar to switch between free models (like Gemma 4 or Flash-Lite) and paid models anytime. If a free model gets busy, the app automatically retries and falls back for you.',
    },
    {
      title: '2. Pitch Any World You Imagine',
      body: 'Choose how hands-on you want to be (1: Just Infer It, 2: Quick Q&A, or 3: Inspire Me tap-choices). Type anything—from a classic tavern to a wild three-way genre mashup.',
    },
    {
      title: '3. Make Your Character & Art',
      body: 'Pick an Archetype, Guided build, Random, or World-Themed Personality Quiz. On Step 5, copy a tailored prompt into your favorite image generator and upload the result to lock your visual style.',
    },
    {
      title: '4. Play, Undo, & Save Anywhere',
      body: 'Type what you do in the bottom box (drag its top edge to resize!). Use the top-left Menu (☰) to jump back to Main Menu anytime, Rewind to undo a turn, or Save to download an encrypted backup.',
    },
  ];

  return (
    <>
      {inspectorActive && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center pointer-events-none px-4">
          <div className="pointer-events-auto max-w-lg w-full rounded-2xl bg-[#161d26]/95 border-2 border-teal-400 shadow-2xl p-4 space-y-1.5 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-teal-300 uppercase">
                <HelpCircle className="w-4 h-4" /> Inspector Mode Active (Hover Anything)
              </span>
              <button
                onClick={onCloseInspector}
                className="px-2 py-0.5 rounded bg-[#0f1419] border border-slate-700 text-[11px] text-slate-300 hover:text-white"
              >
                Exit (Esc)
              </button>
            </div>
            {hoveredTip ? (
              <div className="text-xs text-slate-200 leading-relaxed">
                <strong className="text-amber-300">{hoveredTip.label}:</strong> {hoveredTip.text}
              </div>
            ) : (
              <div className="text-xs text-slate-400">
                Move your mouse over any button, dropdown, or tab to see a plain-English guide to what it does.
              </div>
            )}
          </div>
        </div>
      )}

      {tutorialOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onCloseTutorial}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-[#161d26] border border-amber-500/40 p-6 space-y-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-sm font-bold text-amber-400">
                <Compass className="w-4 h-4" /> Quick Guided Walkthrough
              </span>
              <button onClick={onCloseTutorial} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#0f1419] border border-slate-800 space-y-2">
              <div className="text-sm font-semibold text-white">{TUTORIAL_STEPS[tutStep].title}</div>
              <p className="text-xs text-slate-300 leading-relaxed">{TUTORIAL_STEPS[tutStep].body}</p>
              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] font-mono text-slate-500">
                  Step {tutStep + 1} of {TUTORIAL_STEPS.length}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={tutStep === 0}
                    onClick={() => setTutStep((s) => Math.max(0, s - 1))}
                    className="px-2.5 py-1 rounded bg-[#161d26] border border-slate-700 text-xs text-slate-300 disabled:opacity-40"
                  >
                    Back
                  </button>
                  <button
                    disabled={tutStep === TUTORIAL_STEPS.length - 1}
                    onClick={() => setTutStep((s) => Math.min(TUTORIAL_STEPS.length - 1, s + 1))}
                    className="px-2.5 py-1 rounded bg-amber-500 text-[#0f1419] font-semibold text-xs disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-300">
                <Sparkles className="w-3.5 h-3.5" /> Or Jump Right In with a Starter World:
              </div>
              <div className="grid grid-cols-1 gap-2">
                {STARTER_PRESETS.map((preset) => (
                  <button
                    key={preset.title}
                    onClick={() => {
                      onSelectPreset(preset);
                      onCloseTutorial();
                    }}
                    className="text-left p-3 rounded-xl bg-[#0f1419] border border-slate-800 hover:border-teal-400 transition"
                  >
                    <div className="text-xs font-semibold text-white">{preset.title}</div>
                    <div className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">{preset.pitch}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
