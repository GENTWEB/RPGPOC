import React, { useState } from 'react';
import { CheckCircle2, RefreshCw, Upload, Copy, Sparkles, EyeOff } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { apiClient } from '../services/apiClient';

const GENERATOR_OPTIONS = [
  { id: 'nano_banana_web', label: 'Gemini / Nano Banana (Web — Free)' },
  { id: 'dalle_chatgpt', label: 'ChatGPT / DALL-E' },
  { id: 'midjourney', label: 'Midjourney' },
  { id: 'stable_diffusion', label: 'Stable Diffusion / Flux' },
  { id: 'generic', label: 'Other / Custom Generator' },
];

function compressImageToBase64(file, maxDim = 1024) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid image format."));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function PortraitApprovalCard() {
  const {
    campaignState,
    setCampaignState,
    pendingPortrait,
    setPendingPortrait,
    generateCharacterPortrait,
    approvePortraitAndIgnite,
    artTarget,
    setArtTarget,
    useImages,
    setUseImages,
    selectedModel,
    notify,
    busy,
  } = useGame();

  const [promptPack, setPromptPack] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  const handleBuildPrompt = async () => {
    try {
      const pc = campaignState?.activeEntities?.players?.[0];
      const pack = await apiClient.getArtPrompt(campaignState.id, {
        shotType: 'portrait',
        focalEntityIds: pc ? [pc.id] : [],
        targetGenerator: artTarget,
      });
      setPromptPack(pack);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleUploadAndAnalyze = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzing(true);
    try {
      const compressedBase64 = await compressImageToBase64(file, 1024);
      const pc = campaignState?.activeEntities?.players?.[0];
      const res = await apiClient.uploadAndAnalyzeArt(campaignState.id, {
        uploadedBase64: compressedBase64,
        entityId: pc?.id || "pc_1",
        entityName: pc?.name || "Protagonist",
        entityKind: "character",
        targetGenerator: artTarget,
        model: selectedModel,
      });
      setPendingPortrait({ portrait: res.portrait, renderProfile: res.renderProfile });
      if (res.campaignState) setCampaignState({ ...res.campaignState });
      notify("Image saved & Visual DNA locked for future prompts!", "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSkipArt = async () => {
    setUseImages(false);
    setPendingPortrait({ portrait: { storagePath: 'text_only_mode' } });
    try {
      const approval = await apiClient.advanceSetup(campaignState.id, 'portrait_approval', {
        approved: true,
        portraitRef: 'text_only_mode',
      });
      const ignited = await apiClient.advanceSetup(campaignState.id, 'world_ignition', {
        model: selectedModel,
        thinkingLevel: 'Mid',
      });
      setCampaignState({ ...(ignited.campaignState || approval.campaignState) });
      setPendingPortrait(null);
      notify('Text-only story mode enabled. Welcome to your world!', 'success');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="rounded-xl bg-[#161d26] border border-amber-500/40 p-5 space-y-4 shadow-lg">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
          <Sparkles className="w-4 h-4" /> Step 5 · Character Art &amp; Visual Style
        </div>
        <button
          onClick={handleSkipArt}
          disabled={busy || analyzing}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0f1419] border border-slate-700 hover:border-slate-500 text-[11px] text-slate-300"
          title="Play without generated images (0 image API cost)"
        >
          <EyeOff className="w-3.5 h-3.5" /> Skip Images (Text Only)
        </button>
      </div>

      {pendingPortrait?.portrait?.signedUrl ? (
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <img
            src={pendingPortrait.portrait.signedUrl}
            alt="Character portrait preview"
            className="w-44 h-64 object-cover rounded-lg border border-slate-700 bg-[#0f1419]"
          />
          <div className="flex-1 space-y-3 text-sm text-slate-300">
            <p>
              Look good? Approving locks your character’s visual DNA so future scenes stay consistent with your generator’s style.
            </p>
            {pendingPortrait.renderProfile?.observedStyleCeiling && (
              <div className="p-2.5 rounded-lg bg-[#0f1419] border border-teal-500/40 text-xs text-teal-200">
                <strong>Locked Art Style:</strong> {pendingPortrait.renderProfile.observedStyleCeiling}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={approvePortraitAndIgnite}
                disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-[#0f1419] font-semibold text-xs"
              >
                <CheckCircle2 className="w-4 h-4" /> Approve &amp; Start Story
              </button>
              <button
                onClick={() => setPendingPortrait(null)}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0f1419] border border-slate-700 text-slate-200 text-xs"
              >
                <RefreshCw className="w-4 h-4" /> Try Another
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-xs">
          <p className="text-slate-300">
            Choose where you want to generate your character art. Copy our tailored prompt, generate it in your favorite tool, then upload it back—Vision will lock in your generator’s exact style!
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={artTarget}
              onChange={(e) => setArtTarget(e.target.value)}
              className="rounded-lg bg-[#0f1419] border border-slate-700 px-3 py-2 text-slate-100"
            >
              {GENERATOR_OPTIONS.map((g) => (
                <option key={g.id} value={g.id}>{g.label}</option>
              ))}
            </select>
            <button
              onClick={handleBuildPrompt}
              className="px-3.5 py-2 rounded-lg bg-teal-500/20 border border-teal-400/60 text-teal-200 font-semibold"
            >
              Craft Tailored Prompt (Free)
            </button>
            <button
              onClick={() => generateCharacterPortrait(null, false)}
              disabled={busy}
              title="Uses Nano Banana 2 API (requires AI Studio billing)"
              className="px-3.5 py-2 rounded-lg bg-amber-500/15 border border-amber-500/50 text-amber-300 font-semibold"
            >
              Auto-Generate (Paid API)
            </button>
          </div>

          {promptPack && (
            <div className="p-3.5 rounded-xl bg-[#0f1419] border border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-teal-400">
                  PROMPT FOR {promptPack.generatorLabel.toUpperCase()}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(promptPack.prompt);
                    notify('Prompt copied to clipboard!', 'success');
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px]"
                >
                  <Copy className="w-3 h-3" /> Copy Prompt
                </button>
              </div>
              <div className="p-2.5 rounded bg-[#161d26] text-slate-200 font-mono text-[11px] leading-relaxed select-all">
                {promptPack.prompt}
              </div>
              {promptPack.negativePrompt && (
                <div className="text-[11px] text-slate-400">
                  <strong className="text-red-300">Negative Prompt:</strong> {promptPack.negativePrompt}
                </div>
              )}
            </div>
          )}

          <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0f1419] font-semibold">
            <Upload className="w-4 h-4" />
            {analyzing ? 'Analyzing Visual DNA...' : 'Upload My Generated Portrait'}
            <input type="file" accept="image/*" className="hidden" onChange={handleUploadAndAnalyze} disabled={analyzing} />
          </label>
        </div>
      )}
    </div>
  );
}
