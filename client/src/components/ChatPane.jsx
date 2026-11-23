import React, { useEffect, useRef, useState } from 'react';
import { PlusCircle, FolderOpen, Upload, Sparkles, ZoomIn } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { apiClient } from '../services/apiClient';
import RollBadge from './RollBadge';
import PortraitApprovalCard from './PortraitApprovalCard';
import ComposerBar from './ComposerBar';

export default function ChatPane() {
  const {
    campaigns,
    campaignState,
    setCampaignState,
    startNewCampaign,
    loadCampaign,
    setLightboxImage,
    generateCharacterPortrait,
    notify,
    busy,
  } = useGame();

  const bottomRef = useRef(null);
  const [setupForm, setSetupForm] = useState({
    settingDescription: '',
    techLevel: 'Cyberpunk 2050',
    narratorStyle: 'William Gibson meets Raymond Chandler',
    axxRating: 2,
    axx4Confirmed: false,
    scaryRating: 2,
    dateTime: '2050-09-20 04:00',
    playerCount: 1,
    rulesetMode: 'CLASSIC_D20',
    creationMethod: 'Guided',
    name: '',
    appearance: '',
    strength: '',
    flaw: '',
    archetypeName: '',
  });
  const [archetypes, setArchetypes] = useState(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [campaignState?.chatLog?.length, campaignState?.narratorState?.currentStep]);

  useEffect(() => {
    if (campaignState?.narratorState?.currentStep === 'character_creation' && !archetypes) {
      apiClient.getArchetypes().then(setArchetypes).catch(() => {});
    }
  }, [campaignState?.narratorState?.currentStep, archetypes]);

  const handleImportJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        const res = await apiClient.importSave(parsed);
        setCampaignState(res.campaignState);
        notify('Imported Synchronized Save JSON into Firestore.', 'success');
      } catch (err) {
        notify(`Import failed: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
  };

  const runSetupStep = async (step, payload) => {
    try {
      const res = await apiClient.advanceSetup(campaignState.id, step, payload);
      setCampaignState(res.campaignState);
      notify(`Completed setup stage: ${step}`, 'success');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  if (!campaignState) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 overflow-y-auto">
        <div className="max-w-lg space-y-2">
          <h2 className="text-xl font-bold text-white">Campaign Ignition Console</h2>
          <p className="text-sm text-slate-400">
            Start a new world synthesized strictly from your setup parameters, resume an active Firestore campaign, or import a Google Drive save file.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => startNewCampaign('CLASSIC_D20')}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0f1419] font-semibold text-sm"
          >
            <PlusCircle className="w-4 h-4" /> New Campaign (d20)
          </button>
          <button
            onClick={() => startNewCampaign('PSYCH_REALISM')}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500/20 border border-teal-400/60 hover:bg-teal-500/30 text-teal-200 font-semibold text-sm"
          >
            <Sparkles className="w-4 h-4" /> New Campaign (Psych Realism)
          </button>
          <label className="cursor-pointer flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#161d26] border border-slate-700 hover:border-amber-500 text-slate-200 text-sm">
            <Upload className="w-4 h-4" /> Import Drive JSON
            <input type="file" accept="application/json" className="hidden" onChange={handleImportJson} />
          </label>
        </div>

        {campaigns.length > 0 && (
          <div className="w-full max-w-lg text-left space-y-2 pt-4">
            <h3 className="text-xs font-mono uppercase text-slate-400">Saved Firestore Campaigns</h3>
            <div className="space-y-2">
              {campaigns.map((c) => (
                <button
                  key={c.id}
                  onClick={() => loadCampaign(c.id)}
                  className="w-full p-3 rounded-xl bg-[#161d26] border border-slate-800 hover:border-amber-500/50 flex items-center justify-between text-left"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">
                      {c.settingDescription || c.id}
                    </div>
                    <div className="text-xs font-mono text-slate-400">
                      {c.rulesetMode} · Turn {c.turnNumber} · {c.currentStep}
                    </div>
                  </div>
                  <FolderOpen className="w-4 h-4 text-amber-400 shrink-0 ml-3" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const step = campaignState.narratorState?.currentStep;
  const isSetup = campaignState.narratorState?.currentProcess === 'setup';
  const categories = campaignState.globalState?.settingCategories || [];
  const isCustomOnly = categories.length === 1 && categories[0] === 'Custom';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Sequential Setup Wizard Inline Cards */}
        {isSetup && step === 'ignition' && (
          <div className="rounded-xl bg-[#161d26] border border-slate-700 p-5 space-y-3">
            <div className="text-xs font-mono text-amber-400 uppercase">Step 1 // Chrono-Seed Ignition</div>
            <p className="text-sm text-slate-300">
              Lock your campaign Chrono-Seed from the server timestamp and begin world synthesis.
            </p>
            <button
              onClick={() => runSetupStep('ignition', {})}
              className="px-4 py-2 rounded-lg bg-amber-500 text-[#0f1419] font-semibold text-xs"
            >
              Initialize Chrono-Seed
            </button>
          </div>
        )}

        {isSetup && step === 'setting' && (
          <div className="rounded-xl bg-[#161d26] border border-slate-700 p-5 space-y-3">
            <div className="text-xs font-mono text-amber-400 uppercase">Step 2 // Setting Input (Text or Moodboard)</div>
            <textarea
              rows={3}
              value={setupForm.settingDescription}
              onChange={(e) => setSetupForm({ ...setupForm, settingDescription: e.target.value })}
              placeholder="Describe your world, genre mood, and stakes (or upload a moodboard image below)..."
              className="w-full rounded-lg bg-[#0f1419] border border-slate-700 p-3 text-sm text-slate-100"
            />
            <button
              onClick={() => runSetupStep('setting', { settingDescription: setupForm.settingDescription })}
              disabled={!setupForm.settingDescription.trim()}
              className="px-4 py-2 rounded-lg bg-amber-500 text-[#0f1419] font-semibold text-xs disabled:opacity-40"
            >
              Confirm Setting
            </button>
          </div>
        )}

        {isSetup && step === 'parameters' && (
          <div className="rounded-xl bg-[#161d26] border border-slate-700 p-5 space-y-3">
            <div className="text-xs font-mono text-amber-400 uppercase">Step 3 // Campaign Parameters</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="text-slate-400">Tech Level</span>
                <input
                  value={setupForm.techLevel}
                  onChange={(e) => setSetupForm({ ...setupForm, techLevel: e.target.value })}
                  className="w-full rounded bg-[#0f1419] border border-slate-700 px-2.5 py-1.5 text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Narrator Style (Author / Film / TV)</span>
                <input
                  value={setupForm.narratorStyle}
                  onChange={(e) => setSetupForm({ ...setupForm, narratorStyle: e.target.value })}
                  className="w-full rounded bg-[#0f1419] border border-slate-700 px-2.5 py-1.5 text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Ruleset Mode</span>
                <select
                  value={setupForm.rulesetMode}
                  onChange={(e) => setSetupForm({ ...setupForm, rulesetMode: e.target.value })}
                  className="w-full rounded bg-[#0f1419] border border-slate-700 px-2.5 py-1.5 text-slate-100"
                >
                  <option value="CLASSIC_D20">CLASSIC_D20 (Tactical Rolls)</option>
                  <option value="PSYCH_REALISM">PSYCH_REALISM (Know Thyself)</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Starting In-Game Date &amp; Time</span>
                <input
                  value={setupForm.dateTime}
                  onChange={(e) => setSetupForm({ ...setupForm, dateTime: e.target.value })}
                  className="w-full rounded bg-[#0f1419] border border-slate-700 px-2.5 py-1.5 text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Global AXX Rating (0-4)</span>
                <input
                  type="number"
                  min={0}
                  max={4}
                  value={setupForm.axxRating}
                  onChange={(e) => setSetupForm({ ...setupForm, axxRating: Number(e.target.value) })}
                  className="w-full rounded bg-[#0f1419] border border-slate-700 px-2.5 py-1.5 text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Global SCARY Rating (0-3)</span>
                <input
                  type="number"
                  min={0}
                  max={3}
                  value={setupForm.scaryRating}
                  onChange={(e) => setSetupForm({ ...setupForm, scaryRating: Number(e.target.value) })}
                  className="w-full rounded bg-[#0f1419] border border-slate-700 px-2.5 py-1.5 text-slate-100"
                />
              </label>
            </div>
            {setupForm.axxRating === 4 && (
              <label className="flex items-center gap-2 p-2.5 rounded bg-red-950/50 border border-red-500/40 text-xs text-red-200">
                <input
                  type="checkbox"
                  checked={setupForm.axx4Confirmed}
                  onChange={(e) => setSetupForm({ ...setupForm, axx4Confirmed: e.target.checked })}
                />
                I confirm mature/trauma-tier themes (AXX 4). NPCs under age 19 remain hardcoded at AXX 1.
              </label>
            )}
            <button
              onClick={() => runSetupStep('parameters', setupForm)}
              className="px-4 py-2 rounded-lg bg-amber-500 text-[#0f1419] font-semibold text-xs"
            >
              Lock Campaign Parameters
            </button>
          </div>
        )}

        {isSetup && step === 'character_creation' && (
          <div className="rounded-xl bg-[#161d26] border border-slate-700 p-5 space-y-3">
            <div className="text-xs font-mono text-amber-400 uppercase">Step 4 // Character Creation (40-Point Cap)</div>
            <div className="flex flex-wrap gap-2">
              {(!isCustomOnly ? ['Archetype', 'Guided', 'Random', 'SJT'] : ['Guided', 'Random', 'SJT']).map((m) => (
                <button
                  key={m}
                  onClick={() => setSetupForm({ ...setupForm, creationMethod: m })}
                  className={`px-3 py-1 rounded text-xs font-mono border ${
                    setupForm.creationMethod === m
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-[#0f1419] border-slate-700 text-slate-300'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {setupForm.creationMethod === 'Archetype' && archetypes && (
              <select
                value={setupForm.archetypeName}
                onChange={(e) => setSetupForm({ ...setupForm, archetypeName: e.target.value })}
                className="w-full rounded bg-[#0f1419] border border-slate-700 px-3 py-2 text-xs text-slate-100"
              >
                <option value="">Select a seeded archetype...</option>
                {categories
                  .filter((cat) => archetypes[cat])
                  .flatMap((cat) => archetypes[cat])
                  .map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name} — {a.description}
                    </option>
                  ))}
              </select>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <input
                placeholder="Character Name"
                value={setupForm.name}
                onChange={(e) => setSetupForm({ ...setupForm, name: e.target.value })}
                className="rounded bg-[#0f1419] border border-slate-700 px-3 py-2 text-slate-100"
              />
              <input
                placeholder="Appearance (optional, lazy-filled later)"
                value={setupForm.appearance}
                onChange={(e) => setSetupForm({ ...setupForm, appearance: e.target.value })}
                className="rounded bg-[#0f1419] border border-slate-700 px-3 py-2 text-slate-100"
              />
              <input
                placeholder="Defining Strength"
                value={setupForm.strength}
                onChange={(e) => setSetupForm({ ...setupForm, strength: e.target.value })}
                className="rounded bg-[#0f1419] border border-slate-700 px-3 py-2 text-slate-100"
              />
              <input
                placeholder="Defining Flaw"
                value={setupForm.flaw}
                onChange={(e) => setSetupForm({ ...setupForm, flaw: e.target.value })}
                className="rounded bg-[#0f1419] border border-slate-700 px-3 py-2 text-slate-100"
              />
            </div>

            <button
              onClick={() => runSetupStep('character_creation', setupForm)}
              className="px-4 py-2 rounded-lg bg-amber-500 text-[#0f1419] font-semibold text-xs"
            >
              Create Protagonist
            </button>
          </div>
        )}

        {isSetup && step === 'portrait_approval' && <PortraitApprovalCard />}

        {/* Narrative Chat Stream */}
        {(campaignState.chatLog || []).map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'player' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-3xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'player'
                  ? 'bg-amber-500/15 border border-amber-500/40 text-amber-50'
                  : msg.role === 'system'
                  ? 'bg-slate-900/80 border border-slate-800 text-slate-400 font-mono text-xs'
                  : 'bg-[#161d26] border border-slate-800 text-slate-100'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.text}</div>

              {msg.roll && <RollBadge roll={msg.roll} />}

              {msg.panel?.signedUrl && (
                <div className="mt-3">
                  <button
                    onClick={() => setLightboxImage(msg.panel)}
                    className="group relative block rounded-xl overflow-hidden border border-amber-500/40"
                  >
                    <img
                      src={msg.panel.signedUrl}
                      alt={msg.panel.brief || 'Graphic novel panel'}
                      className="max-h-72 object-cover"
                    />
                    <span className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/75 text-[10px] font-mono text-amber-300 inline-flex items-center gap-1 opacity-90 group-hover:opacity-100">
                      <ZoomIn className="w-3 h-3" /> Zoom Panel
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <ComposerBar
        onUploadImage={(base64) => {
          if (step === 'portrait_approval') {
            generateCharacterPortrait(base64, true);
          } else {
            setSetupForm((prev) => ({
              ...prev,
              settingDescription: `${prev.settingDescription}\n[Moodboard Image Attached]`.trim(),
            }));
            notify('Moodboard image attached to setup.', 'info');
          }
        }}
      />
    </div>
  );
}
