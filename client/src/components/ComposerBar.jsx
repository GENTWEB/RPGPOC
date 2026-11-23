import React, { useState } from 'react';
import { Send, Paperclip, Terminal, Shield, Eye } from 'lucide-react';
import { useGame } from '../context/GameContext';

const OOC_SHORTCUTS = [
  { label: 'Paint Panel', cmd: 'analysis: paintMeAPicture' },
  { label: 'Help', cmd: 'analysis: help' },
  { label: 'Save', cmd: 'analysis: saveGame' },
  { label: 'Pause', cmd: 'analysis: pauseRole' },
  { label: 'Resume', cmd: 'analysis: resumeRole' },
  { label: 'Travel...', cmd: 'letsGoTo ' },
];

export default function ComposerBar({ onUploadImage }) {
  const { submitTurn, busy, oocDrawerOpen, campaignState } = useGame();
  const [text, setText] = useState('');
  const [tacticalAction, setTacticalAction] = useState(null);

  const inCombat = Boolean(campaignState?.worldState?.combatState?.active);

  const handleSend = () => {
    if (!text.trim() || busy) return;
    submitTurn(text, tacticalAction);
    setText('');
    setTacticalAction(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file || !onUploadImage) return;
    const reader = new FileReader();
    reader.onload = () => onUploadImage(reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <div className="shrink-0 border-t border-slate-800 bg-[#161d26] p-3 space-y-2">
      {oocDrawerOpen && (
        <div className="flex flex-wrap gap-1.5 pb-2 border-b border-slate-800">
          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-teal-400 mr-1">
            <Terminal className="w-3 h-3" /> OOC:
          </span>
          {OOC_SHORTCUTS.map((s) => (
            <button
              key={s.label}
              onClick={() => setText(s.cmd)}
              className="px-2 py-0.5 rounded bg-[#0f1419] border border-slate-700 hover:border-teal-400 text-[11px] font-mono text-slate-300"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {inCombat && (
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-amber-400">TACTICAL (2 AP):</span>
          <button
            onClick={() => setTacticalAction(tacticalAction === 'hunker_down' ? null : 'hunker_down')}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${
              tacticalAction === 'hunker_down'
                ? 'bg-teal-500/20 border-teal-400 text-teal-200'
                : 'bg-[#0f1419] border-slate-700 text-slate-300'
            }`}
          >
            <Shield className="w-3 h-3" /> Hunker Down (1 AP)
          </button>
          <button
            onClick={() => setTacticalAction(tacticalAction === 'overwatch' ? null : 'overwatch')}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${
              tacticalAction === 'overwatch'
                ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                : 'bg-[#0f1419] border-slate-700 text-slate-300'
            }`}
          >
            <Eye className="w-3 h-3" /> Overwatch (2 AP)
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <label
          className="p-2.5 rounded-lg bg-[#0f1419] border border-slate-700 hover:border-amber-500 text-slate-300 cursor-pointer"
          title="Upload Moodboard or Reference Photo"
        >
          <Paperclip className="w-4 h-4" />
          <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </label>

        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={busy || !campaignState}
          placeholder={
            campaignState
              ? 'Declare your action, dialogue, or OOC command (Enter to send)...'
              : 'Start or load a campaign to begin...'
          }
          className="flex-1 resize-none rounded-lg bg-[#0f1419] border border-slate-700 focus:border-amber-500 focus:outline-none px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
        />

        <button
          onClick={handleSend}
          disabled={busy || !text.trim() || !campaignState}
          className="p-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0f1419] font-semibold disabled:opacity-40"
          title="Send Turn"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
