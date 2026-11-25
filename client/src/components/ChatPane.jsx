import { getShuffledPitches, DEFAULT_STEP3_EXAMPLES, SETTING_HELP_MODALS } from "../data/setupExamples";
import React, { useEffect, useRef, useState } from 'react';
import {
  PlusCircle,
  FolderOpen,
  Upload,
  Sparkles,
  ZoomIn,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { useGame } from '../context/GameContext';
import { apiClient } from '../services/apiClient';
import RollBadge from './RollBadge';
import PortraitApprovalCard from './PortraitApprovalCard';
import ComposerBar from './ComposerBar';

const EXAMPLE_PITCHES = getShuffledPitches();

function renderFormattedText(text) {
  const lines = String(text || '').split('\n');
  return lines.map((line, lineIdx) => {
    const tokens = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return (
      <React.Fragment key={lineIdx}>
        {tokens.map((tok, i) => {
          if (tok.startsWith('**') && tok.endsWith('**')) {
            return <strong key={i} className="font-semibold text-white">{tok.slice(2, -2)}</strong>;
          }
          if (tok.startsWith('*') && tok.endsWith('*') && tok.length > 2) {
            return <em key={i} className="italic text-amber-100/90">{tok.slice(1, -1)}</em>;
          }
          return <React.Fragment key={i}>{tok}</React.Fragment>;
        })}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

export default function ChatPane({ onOpenTutorial = () => {} } = {}) {
  const {
    campaigns,
    draftCampaign,
    campaignState,
    setCampaignState,
    startNewCampaign,
    loadCampaign,
    deleteCampaign,
    setLightboxImage,
    generateCharacterPortrait,
    notify,
    busy,
    thinkingStatus,
    setThinkingStatus,
    cooldownSeconds,
    cancelActiveCall,
    runResilientLlmCall,
    selectedModel,
    thinkingLevel,
    involvementLevel,
    setInvolvementLevel,
    submitTurn,
  } = useGame();

  const bottomRef = useRef(null);
  const [setupForm, setSetupForm] = useState({
    settingDescription: '',
    techLevel: '',
    narratorStyle: '',
    axxRating: 2,
    axx4Confirmed: false,
    scaryRating: 2,
    scary3Confirmed: false,
    dateTime: '',
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
  const [sjtScenarios, setSjtScenarios] = useState([]);
  const [sjtAnswers, setSjtAnswers] = useState([]);
  const [sjtLoading, setSjtLoading] = useState(false);
  const [editingRuleset, setEditingRuleset] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [expandedThoughts, setExpandedThoughts] = useState({});
  const [pitchIdx, setPitchIdx] = useState(0);
  const [helpModalKey, setHelpModalKey] = useState(null);
  const [autoFilledFields, setAutoFilledFields] = useState({});

  const step3Hints = campaignState?.globalState?.step3Hints || null;
  const step3Examples = {
    techLevel: step3Hints?.examples?.techLevel?.length ? step3Hints.examples.techLevel : DEFAULT_STEP3_EXAMPLES.techLevel,
    narratorStyle: step3Hints?.examples?.narratorStyle?.length ? step3Hints.examples.narratorStyle : DEFAULT_STEP3_EXAMPLES.narratorStyle,
    dateTime: step3Hints?.examples?.dateTime?.length ? step3Hints.examples.dateTime : DEFAULT_STEP3_EXAMPLES.dateTime,
  };

  useEffect(() => {
    const pf = campaignState?.globalState?.step3Hints?.prefill;
    if (!pf) return;
    setSetupForm((prev) => {
      const next = { ...prev };
      const filled = {};
      if (!prev.techLevel && pf.techLevel) { next.techLevel = pf.techLevel; filled.techLevel = true; }
      if (!prev.narratorStyle && pf.narratorStyle) { next.narratorStyle = pf.narratorStyle; filled.narratorStyle = true; }
      if (!prev.dateTime && pf.dateTime) { next.dateTime = pf.dateTime; filled.dateTime = true; }
      if (Object.keys(filled).length > 0) setAutoFilledFields((old) => ({ ...old, ...filled }));
      return next;
    });
  }, [campaignState?.globalState?.step3Hints]);
  useEffect(() => {
    const preset = localStorage.getItem("dl_preset_pitch");
    if (preset && campaignState?.narratorState?.currentStep === "setting") {
      setSetupForm((p) => ({ ...p, settingDescription: preset }));
      localStorage.removeItem("dl_preset_pitch");
    }
  }, [campaignState?.narratorState?.currentStep]);

  useEffect(() => {
    const timer = setInterval(() => {
      setPitchIdx((prev) => (prev + 1) % EXAMPLE_PITCHES.length);
    }, 5500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [campaignState?.chatLog?.length, campaignState?.narratorState?.currentStep, thinkingStatus]);

  useEffect(() => {
    if (campaignState?.metaData?.rulesetMode) {
      setSetupForm((prev) => ({ ...prev, rulesetMode: campaignState.metaData.rulesetMode }));
    }
  }, [campaignState?.id, campaignState?.metaData?.rulesetMode]);

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
        setCampaignState({ ...res.campaignState });
        notify('Imported your saved story.', 'success');
      } catch (err) {
        notify(`Import failed: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
  };

  const runSetupStep = async (step, payload) => {
    try {
      const res = await apiClient.advanceSetup(campaignState.id, step, {
        ...payload,
        model: selectedModel,
        thinkingLevel,
      });
      setCampaignState({ ...res.campaignState });
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleBrainstormSetting = async () => {
    if (!setupForm.settingDescription.trim()) return;
    setThinkingStatus('Game Master is brainstorming your world...');
    try {
      const res = await runResilientLlmCall("Game Master is brainstorming your world...", (modelToUse) =>
        apiClient.setupChat(campaignState.id, {
          message: setupForm.settingDescription || (involvementLevel === 3 ? "Help me pick a world using quick choices!" : ""),
          involvementLevel,
          model: modelToUse,
          thinkingLevel,
        })
      );
      setCampaignState({ ...res.campaignState });
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setThinkingStatus(null);
    }
  };

  const handleGenerateSjt = async () => {
    setSjtLoading(true);
    setThinkingStatus('Crafting scenarios for your world...');
    try {
      const res = await runResilientLlmCall("Crafting scenarios for your world...", (modelToUse) =>
        apiClient.generateThemedSjt(campaignState.id, {
          stage: sjtScenarios.length === 0 ? "foundation" : "adaptive",
          count: 5,
          previousAnswers: sjtAnswers,
          model: modelToUse,
          thinkingLevel,
        })
      );
      setSjtScenarios(res.scenarios || []);
      setSjtAnswers([]);
      notify('Custom scenarios ready!', 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSjtLoading(false);
      setThinkingStatus(null);
    }
  };

  // MAIN MENU
  if (!campaignState) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 overflow-y-auto">
        <div className="max-w-lg space-y-2">
          <h2 className="text-2xl font-bold text-white">Your Stories</h2>
          <p className="text-sm text-slate-400">
            Jump back into a saved adventure or build a brand-new world from scratch with your AI Game Master.
          </p>
        </div>

        {/* Unfinished Setup Banner (kept separate from Saved Stories) */}
        {draftCampaign && (
          <div className="w-full max-w-lg p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 text-left flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <AlertCircle className="w-4 h-4 shrink-0" /> Unfinished World Setup Found
              </div>
              <div className="text-xs text-slate-300 truncate mt-0.5">
                {draftCampaign.settingDescription || 'New World Draft'}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => loadCampaign(draftCampaign.id)}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-[#0f1419] font-semibold text-xs"
              >
                Resume
              </button>
              <button
                onClick={() => deleteCampaign(draftCampaign.id)}
                className="px-2.5 py-1.5 rounded-lg bg-[#0f1419] border border-slate-700 text-slate-300 hover:text-red-300 text-xs"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => startNewCampaign('CLASSIC_D20')}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0f1419] font-semibold text-sm"
            title="Classic dice-rolling RPG with tactical combat"
          >
            <PlusCircle className="w-4 h-4" /> New Story (Dice &amp; Tactics)
          </button>
          <button
            onClick={() => startNewCampaign('PSYCH_REALISM')}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500/20 border border-teal-400/60 hover:bg-teal-500/30 text-teal-200 font-semibold text-sm"
            title="Story-first mode where your character's composure and choices matter most"
          >
            <Sparkles className="w-4 h-4" /> New Story (Deep Realism)
          </button>
          <label className="cursor-pointer flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#161d26] border border-slate-700 hover:border-amber-500 text-slate-200 text-sm">
            <Upload className="w-4 h-4" /> Load Save File
            <input type="file" accept="application/json" className="hidden" onChange={handleImportJson} />
          </label>
        </div>

        {campaigns.length > 0 && (
          <div className="w-full max-w-lg text-left space-y-2 pt-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Saved Stories</h3>
            <div className="space-y-2">
              {campaigns.map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded-xl bg-[#161d26] border border-slate-800 hover:border-amber-500/50 flex items-center justify-between gap-2"
                >
                  <button
                    onClick={() => loadCampaign(c.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="text-sm font-medium text-white truncate">
                      {c.settingDescription || c.id}
                    </div>
                    <div className="text-xs text-slate-400">
                      {c.rulesetMode === 'PSYCH_REALISM' ? 'Deep Realism' : 'Dice & Tactics'} · Turn {c.turnNumber}
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => loadCampaign(c.id)}
                      className="p-2 rounded-lg bg-[#0f1419] border border-slate-700 text-amber-400 hover:border-amber-500"
                      title="Open Story"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(c.id)}
                      className="p-2 rounded-lg bg-[#0f1419] border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/50"
                      title="Delete Saved Story"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {confirmDeleteId && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-xl bg-[#161d26] border border-red-500/40 p-5 space-y-4 text-left">
              <h4 className="text-sm font-bold text-white">Delete this saved story?</h4>
              <p className="text-xs text-slate-400">
                This permanently removes the save from your cloud account. This cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="px-3 py-1.5 rounded-lg bg-[#0f1419] border border-slate-700 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const id = confirmDeleteId;
                    setConfirmDeleteId(null);
                    await deleteCampaign(id);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-xs"
                >
                  Delete Permanently
                </button>
              </div>
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
      {isSetup && step === "setting" && (campaignState.chatLog || []).length > 0 && (
        <div className="shrink-0 px-4 py-2 bg-[#161d26]/95 border-b border-amber-500/30 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-300 truncate">Ready with your world?</span>
          <button
            onClick={() => runSetupStep("setting", { settingDescription: setupForm.settingDescription || campaignState.globalState?.settingDescription || "Custom World" })}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0f1419] font-semibold text-xs shrink-0"
          >
            Lock World &amp; Continue →
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {isSetup && step === 'ignition' && (
          <div className="rounded-xl bg-[#161d26] border border-slate-700 p-5 space-y-4">
            <div>
              <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Step 1 · Choose Your Setup Involvement (1–3)</div>
              <p className="text-xs text-slate-400 mt-1">
                Pick how much of the worldbuilding you want to direct versus hand off to the Game Master.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              {[
                { lvl: 1, title: "1 · Just Infer It", desc: "You drop a quick pitch and the GM infers the rest of the world immediately." },
                { lvl: 2, title: "2 · Quick Q&A", desc: "You pitch a premise and the GM asks at most 6 sharp clarifying questions before moving on." },
                { lvl: 3, title: "3 · Inspire Me", desc: "Not sure yet? The GM plays reverse 20-questions with tappable choices to spark ideas." },
              ].map((opt) => (
                <button
                  key={opt.lvl}
                  type="button"
                  onClick={() => setInvolvementLevel(opt.lvl)}
                  className={`p-3 rounded-xl border text-left transition space-y-1 ${
                    involvementLevel === opt.lvl
                      ? "bg-amber-500/15 border-amber-400 text-amber-200 ring-1 ring-amber-400/50"
                      : "bg-[#0f1419] border-slate-700 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <div className="font-semibold">{opt.title}</div>
                  <div className="text-[11px] text-slate-400 leading-relaxed">{opt.desc}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => runSetupStep('ignition', { involvementLevel })}
              className="px-4 py-2 rounded-lg bg-amber-500 text-[#0f1419] font-semibold text-xs hover:bg-amber-400 transition"
            >
              Let's Begin (Level {involvementLevel}) →
            </button>
          </div>
        )}

        {isSetup && step === 'setting' && (
          <div className="rounded-xl bg-[#161d26] border border-slate-700 p-5 space-y-3">
            <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Step 2 · Pitch Your World</div>
            <p className="text-xs text-slate-400">
              Describe any setting or wild mashup you want. Click <strong>Brainstorm with GM</strong> to riff on ideas together in the chat below before locking it in.
            </p>
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-slate-300">How hands-on do you want world setup to be?</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {[
                  { lvl: 1, title: "1 · Just Infer It", desc: "I pitch, GM fills in the rest" },
                  { lvl: 2, title: "2 · Quick Q&A", desc: "Max 6 questions, then go" },
                  { lvl: 3, title: "3 · Inspire Me", desc: "Tap quick choices (20Q)" },
                ].map((opt) => (
                  <button
                    key={opt.lvl}
                    type="button"
                    onClick={() => setInvolvementLevel(opt.lvl)}
                    className={`p-2.5 rounded-lg border text-left transition ${
                      involvementLevel === opt.lvl
                        ? "bg-amber-500/15 border-amber-400 text-amber-200"
                        : "bg-[#0f1419] border-slate-700 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    <div className="font-semibold">{opt.title}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={3}
              value={setupForm.settingDescription}
              onChange={(e) => setSetupForm({ ...setupForm, settingDescription: e.target.value })}
              onKeyDown={(e) => { if (e.key === "`" && !setupForm.settingDescription.trim()) { e.preventDefault(); setSetupForm((p) => ({ ...p, settingDescription: EXAMPLE_PITCHES[pitchIdx] })); } }}
              placeholder={`Press \` to use: "${EXAMPLE_PITCHES[pitchIdx]}"`}
              className="w-full rounded-lg bg-[#0f1419] border border-slate-700 p-3 text-sm text-slate-100 placeholder-slate-500"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSetupForm((p) => ({ ...p, settingDescription: EXAMPLE_PITCHES[pitchIdx] }))}
                className="px-3 py-2 rounded-lg bg-[#0f1419] border border-slate-700 hover:border-teal-400 text-slate-300 text-xs"
                title="Insert the currently scrolling example pitch"
              >
                Use Example (`)
              </button>
              <button
                onClick={handleBrainstormSetting}
                disabled={(involvementLevel !== 3 && !setupForm.settingDescription.trim()) || Boolean(thinkingStatus) || busy}
                className="px-4 py-2 rounded-lg bg-teal-500/20 border border-teal-400/60 text-teal-200 font-semibold text-xs disabled:opacity-40"
              >
                {thinkingStatus ? 'Brainstorming...' : 'Brainstorm with GM'}
              </button>
              <button
                onClick={() => runSetupStep('setting', { settingDescription: setupForm.settingDescription })}
                disabled={!setupForm.settingDescription.trim() || busy}
                className="px-4 py-2 rounded-lg bg-amber-500 text-[#0f1419] font-semibold text-xs disabled:opacity-40"
              >
                Lock World &amp; Continue
              </button>
            </div>
          </div>
        )}

        {isSetup && step === 'parameters' && (
          <div className="rounded-xl bg-[#161d26] border border-slate-700 p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Step 3 · World Tone &amp; Vibe</div>
              <span className="text-[10px] font-mono text-slate-400">Press ` in any blank box to use the example</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {[
                { key: "techLevel", label: "Tech & Magic Level" },
                { key: "narratorStyle", label: "Storytelling Style (Book / Movie / Show)" },
              ].map(({ key, label }) => {
                const exList = step3Examples[key];
                const curEx = exList[pitchIdx % exList.length];
                return (
                  <label key={key} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400">{label}</span>
                      {autoFilledFields[key] ? (
                        <span className="text-[10px] font-mono text-teal-300">Auto-filled</span>
                      ) : !setupForm[key] ? (
                        <button
                          type="button"
                          onClick={() => setSetupForm((p) => ({ ...p, [key]: curEx }))}
                          className="text-[10px] font-mono text-amber-400 hover:underline"
                        >
                          Use example
                        </button>
                      ) : null}
                    </div>
                    <input
                      placeholder={`Press \` to use: "${curEx}"`}
                      value={setupForm[key]}
                      onKeyDown={(e) => {
                        if (e.key === "`" && !setupForm[key].trim()) {
                          e.preventDefault();
                          setSetupForm((p) => ({ ...p, [key]: curEx }));
                        }
                      }}
                      onChange={(e) => setSetupForm({ ...setupForm, [key]: e.target.value })}
                      className="w-full rounded bg-[#0f1419] border border-slate-700 px-2.5 py-1.5 text-slate-100"
                    />
                  </label>
                );
              })}

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Play Style</span>
                    <button
                      type="button"
                      onClick={() => setHelpModalKey("rulesetMode")}
                      className="w-4 h-4 rounded-full bg-slate-800 border border-slate-600 text-[10px] font-mono text-teal-300 hover:border-teal-400 inline-flex items-center justify-center"
                      title="Explain Play Style options"
                    >?</button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingRuleset(!editingRuleset)}
                    className="text-[10px] text-teal-400 underline"
                  >
                    {editingRuleset ? 'Done' : 'Change'}
                  </button>
                </div>
                {editingRuleset ? (
                  <select
                    value={setupForm.rulesetMode}
                    onChange={(e) => setSetupForm({ ...setupForm, rulesetMode: e.target.value })}
                    className="w-full rounded bg-[#0f1419] border border-slate-700 px-2.5 py-1.5 text-slate-100"
                  >
                    <option value="CLASSIC_D20">Dice &amp; Tactics (d20)</option>
                    <option value="PSYCH_REALISM">Deep Realism (Composure)</option>
                  </select>
                ) : (
                  <div className="w-full rounded bg-[#0f1419] border border-teal-500/40 px-2.5 py-1.5 text-teal-300">
                    {setupForm.rulesetMode === 'PSYCH_REALISM' ? 'Deep Realism (Composure)' : 'Dice & Tactics (d20)'}
                  </div>
                )}
              </div>

              {(() => {
                const exList = step3Examples.dateTime;
                const curEx = exList[pitchIdx % exList.length];
                return (
                  <label className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400">Starting Era / Approximate Time</span>
                      {autoFilledFields.dateTime ? (
                        <span className="text-[10px] font-mono text-teal-300">Auto-filled</span>
                      ) : !setupForm.dateTime ? (
                        <button
                          type="button"
                          onClick={() => setSetupForm((p) => ({ ...p, dateTime: curEx }))}
                          className="text-[10px] font-mono text-amber-400 hover:underline"
                        >
                          Use example
                        </button>
                      ) : null}
                    </div>
                    <input
                      placeholder={`Press \` to use: "${curEx}"`}
                      value={setupForm.dateTime}
                      onKeyDown={(e) => {
                        if (e.key === "`" && !setupForm.dateTime.trim()) {
                          e.preventDefault();
                          setSetupForm((p) => ({ ...p, dateTime: curEx }));
                        }
                      }}
                      onChange={(e) => setSetupForm({ ...setupForm, dateTime: e.target.value })}
                      className="w-full rounded bg-[#0f1419] border border-slate-700 px-2.5 py-1.5 text-slate-100"
                    />
                  </label>
                );
              })()}

              <label className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Mature Themes Intensity (0–4)</span>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setHelpModalKey("axxRating"); }}
                    className="w-4 h-4 rounded-full bg-slate-800 border border-slate-600 text-[10px] font-mono text-teal-300 hover:border-teal-400 inline-flex items-center justify-center"
                    title="Explain Mature Themes levels 0–4"
                  >?</button>
                </div>
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
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Horror &amp; Suspense Level (0–3)</span>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setHelpModalKey("scaryRating"); }}
                    className="w-4 h-4 rounded-full bg-slate-800 border border-slate-600 text-[10px] font-mono text-teal-300 hover:border-teal-400 inline-flex items-center justify-center"
                    title="Explain Horror & Suspense levels 0–3"
                  >?</button>
                </div>
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

            {helpModalKey && SETTING_HELP_MODALS[helpModalKey] && (
              <div
                className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
                onClick={() => setHelpModalKey(null)}
              >
                <div
                  className="w-full max-w-md rounded-2xl bg-[#161d26] border border-slate-700 p-5 space-y-3 shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-amber-400">{SETTING_HELP_MODALS[helpModalKey].title}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{SETTING_HELP_MODALS[helpModalKey].subtitle}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHelpModalKey(null)}
                      className="px-2 py-0.5 rounded bg-slate-800 text-xs text-slate-300 hover:text-white"
                    >✕</button>
                  </div>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                    {SETTING_HELP_MODALS[helpModalKey].levels.map((lvl) => (
                      <div key={lvl.label} className="p-2.5 rounded-lg bg-[#0f1419] border border-slate-800">
                        <div className="text-xs font-semibold text-teal-300">{lvl.label}</div>
                        <div className="text-xs text-slate-300 mt-0.5 leading-relaxed">{lvl.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {setupForm.axxRating === 4 && (
              <label className="flex items-center gap-2 p-2.5 rounded bg-red-950/50 border border-red-500/40 text-xs text-red-200">
                <input
                  type="checkbox"
                  checked={setupForm.axx4Confirmed}
                  onChange={(e) => setSetupForm({ ...setupForm, axx4Confirmed: e.target.checked })}
                />
                I confirm heavy/mature story themes (Level 4).
              </label>
            )}
            {setupForm.scaryRating === 3 && (
              <label className="flex items-center gap-2 p-2.5 rounded bg-amber-950/50 border border-amber-500/40 text-xs text-amber-200">
                <input
                  type="checkbox"
                  checked={setupForm.scary3Confirmed}
                  onChange={(e) => setSetupForm({ ...setupForm, scary3Confirmed: e.target.checked })}
                />
                I confirm maximum horror &amp; suspense intensity (Level 3).
              </label>
            )}
            <button
              onClick={() => runSetupStep('parameters', setupForm)}
              className="px-4 py-2 rounded-lg bg-amber-500 text-[#0f1419] font-semibold text-xs"
            >
              Continue to Character Creation
            </button>
          </div>
        )}

        {isSetup && step === 'character_creation' && (
          <div className="rounded-xl bg-[#161d26] border border-slate-700 p-5 space-y-3">
            <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Step 4 · Build Your Character</div>
            <div className="flex flex-wrap gap-2">
              {(!isCustomOnly ? ['Archetype', 'Guided', 'Random', 'SJT'] : ['Guided', 'Random', 'SJT']).map((m) => (
                <button
                  key={m}
                  onClick={() => setSetupForm({ ...setupForm, creationMethod: m })}
                  className={`px-3 py-1 rounded text-xs border ${
                    setupForm.creationMethod === m
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-[#0f1419] border-slate-700 text-slate-300'
                  }`}
                >
                  {m === 'SJT' ? 'Personality Quiz' : m}
                </button>
              ))}
            </div>

            {setupForm.creationMethod === 'Archetype' && archetypes && (
              <select
                value={setupForm.archetypeName}
                onChange={(e) => setSetupForm({ ...setupForm, archetypeName: e.target.value })}
                className="w-full rounded bg-[#0f1419] border border-slate-700 px-3 py-2 text-xs text-slate-100"
              >
                <option value="">Pick a starting archetype...</option>
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

            {setupForm.creationMethod === 'SJT' && (
              <div className="p-3.5 rounded-xl bg-[#0f1419] border border-teal-500/40 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-teal-300 font-medium">
                    World-Themed Personality Scenarios ({sjtAnswers.length}/{sjtScenarios.length || 5} answered)
                  </span>
                  <button
                    disabled={sjtLoading}
                    onClick={handleGenerateSjt}
                    className="px-3 py-1 rounded bg-teal-500 text-[#0f1419] font-semibold text-xs disabled:opacity-50"
                  >
                    {sjtLoading ? 'Generating...' : 'Generate Scenarios'}
                  </button>
                </div>

                {sjtScenarios.map((sc, idx) => {
                  const picked = sjtAnswers.find((a) => a.id === sc.id);
                  return (
                    <div key={sc.id || idx} className="p-2.5 rounded-lg bg-[#161d26] border border-slate-800 space-y-2 text-xs">
                      <div className="text-slate-200 font-medium">{idx + 1}. {sc.prompt}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {(sc.choices || []).map((ch, cIdx) => {
                          const selected = picked?.label === ch.label;
                          return (
                            <button
                              key={cIdx}
                              onClick={() => {
                                setSjtAnswers((prev) => [
                                  ...prev.filter((a) => a.id !== sc.id),
                                  { id: sc.id, label: ch.label, leaning: ch.leaning },
                                ]);
                              }}
                              className={`text-left px-2.5 py-1.5 rounded border text-[11px] ${
                                selected
                                  ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                                  : 'bg-[#0f1419] border-slate-700 text-slate-300 hover:border-teal-400'
                              }`}
                            >
                              {ch.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <input
                placeholder="Character Name"
                value={setupForm.name}
                onChange={(e) => setSetupForm({ ...setupForm, name: e.target.value })}
                className="rounded bg-[#0f1419] border border-slate-700 px-3 py-2 text-slate-100"
              />
              <input
                placeholder="Look & Vibe (optional)"
                value={setupForm.appearance}
                onChange={(e) => setSetupForm({ ...setupForm, appearance: e.target.value })}
                className="rounded bg-[#0f1419] border border-slate-700 px-3 py-2 text-slate-100"
              />
              <input
                placeholder="Greatest Strength"
                value={setupForm.strength}
                onChange={(e) => setSetupForm({ ...setupForm, strength: e.target.value })}
                className="rounded bg-[#0f1419] border border-slate-700 px-3 py-2 text-slate-100"
              />
              <input
                placeholder="Biggest Flaw"
                value={setupForm.flaw}
                onChange={(e) => setSetupForm({ ...setupForm, flaw: e.target.value })}
                className="rounded bg-[#0f1419] border border-slate-700 px-3 py-2 text-slate-100"
              />
            </div>

            <button
              onClick={() => runSetupStep('character_creation', { ...setupForm, sjtAnswers })}
              className="px-4 py-2 rounded-lg bg-amber-500 text-[#0f1419] font-semibold text-xs"
            >
              Create Character
            </button>
          </div>
        )}

        {isSetup && step === 'portrait_approval' && <PortraitApprovalCard />}

        {/* Chat Stream */}
        {(campaignState.chatLog || []).map((msg) => {
          const thoughtOpen = Boolean(expandedThoughts[msg.id]);
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'player' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-3xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'player'
                    ? 'bg-amber-500/15 border border-amber-500/40 text-amber-50'
                    : msg.role === 'system'
                    ? 'bg-slate-900/80 border border-slate-800 text-slate-400 text-xs'
                    : 'bg-[#161d26] border border-slate-800 text-slate-100'
                }`}
              >
                {msg.thinking && (
                  <div className="mb-2">
                    <button
                      onClick={() => setExpandedThoughts((p) => ({ ...p, [msg.id]: !p[msg.id] }))}
                      className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-teal-300"
                    >
                      {thoughtOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      Game Master’s reasoning
                    </button>
                    {thoughtOpen && (
                      <div className="mt-1.5 p-2.5 rounded-lg bg-[#0f1419] border border-slate-800 text-xs text-slate-400 whitespace-pre-wrap">
                        {msg.thinking}
                      </div>
                    )}
                  </div>
                )}

                <div>{renderFormattedText(msg.text)}</div>
                {Array.isArray(msg.choices) && msg.choices.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {msg.choices.map((ch, cIdx) => (
                      <button
                        key={cIdx}
                        disabled={busy}
                        onClick={() => submitTurn(ch)}
                        className="px-3 py-1.5 rounded-full bg-teal-500/15 border border-teal-400/50 hover:bg-teal-500/30 text-teal-200 text-xs font-medium disabled:opacity-40"
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                )}

                {msg.roll && <RollBadge roll={msg.roll} />}
                {msg.usedModel && (
                  <div className="mt-2 text-[10px] font-mono text-slate-500 text-right">
                    {msg.fellBack ? `Fallback: ${msg.usedModel}` : `GM: ${msg.usedModel}`}
                  </div>
                )}

                {msg.panel?.signedUrl && (
                  <div className="mt-3">
                    <button
                      onClick={() => setLightboxImage(msg.panel)}
                      className="group relative block rounded-xl overflow-hidden border border-amber-500/40"
                    >
                      <img
                        src={msg.panel.signedUrl}
                        alt={msg.panel.brief || 'Scene art'}
                        className="max-h-72 object-cover"
                      />
                      <span className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/75 text-[10px] text-amber-300 inline-flex items-center gap-1">
                        <ZoomIn className="w-3 h-3" /> Zoom
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Live Thinking Indicator */}
        {thinkingStatus && (
          <div className="flex items-start">
            <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-[#161d26] border border-teal-500/40 text-xs text-teal-200">
              <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
              <span>{thinkingStatus}</span>
              <button
                onClick={cancelActiveCall}
                className="ml-2 px-2 py-0.5 rounded bg-[#0f1419] border border-slate-700 hover:border-red-400 text-[10px] text-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {cooldownSeconds > 0 && (
        <div className="px-4 py-2 bg-red-950/70 border-t border-red-500/40 text-xs text-red-200 flex items-center justify-between">
          <span>
            Free models are currently overloaded. Switch to a paid model in the GM menu, or retry in <strong>{cooldownSeconds}s</strong>.
          </span>
        </div>
      )}
      <ComposerBar
        onUploadImage={(base64) => {
          if (step === 'portrait_approval') {
            generateCharacterPortrait(base64, true);
          } else {
            setSetupForm((prev) => ({
              ...prev,
              settingDescription: `${prev.settingDescription}\n[Moodboard Image Attached]`.trim(),
            }));
            notify('Moodboard image attached.', 'info');
          }
        }}
      />
    </div>
  );
}
