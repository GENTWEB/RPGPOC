node -e '
const fs = require("fs");

// 4a. Add drag-to-resize top handle to ComposerBar.jsx
let cb = fs.readFileSync("client/src/components/ComposerBar.jsx", "utf8");
if (!cb.includes("inputHeight")) {
  cb = cb.replace(
    "const [tacticalAction, setTacticalAction] = useState(null);",
    "const [tacticalAction, setTacticalAction] = useState(null);\n  const [inputHeight, setInputHeight] = useState(() => Number(localStorage.getItem(\x27dl_composer_h\x27)) || 64);\n  const startResize = (e) => {\n    const startY = e.clientY;\n    const startH = inputHeight;\n    const onMove = (ev) => {\n      const next = Math.min(260, Math.max(52, startH + (startY - ev.clientY)));\n      setInputHeight(next);\n      localStorage.setItem(\x27dl_composer_h\x27, String(next));\n    };\n    const onUp = () => { window.removeEventListener(\x27mousemove\x27, onMove); window.removeEventListener(\x27mouseup\x27, onUp); };\n    window.addEventListener(\x27mousemove\x27, onMove);\n    window.addEventListener(\x27mouseup\x27, onUp);\n  };"
  );
  cb = cb.replace(
    `<div className="shrink-0 border-t border-slate-800 bg-[#161d26] p-3 space-y-2">`,
    `<div className="shrink-0 border-t border-slate-800 bg-[#161d26] px-3 pb-3 pt-1 space-y-2">\n      <div onMouseDown={startResize} title="Drag up or down to resize chat box" className="h-2 -mt-1 cursor-row-resize flex items-center justify-center group"><span className="w-10 h-1 rounded-full bg-slate-700 group-hover:bg-amber-400 transition" /></div>`
  );
  cb = cb.replace(
    "rows={2}",
    "style={{ height: `${inputHeight}px` }}"
  );
  fs.writeFileSync("client/src/components/ComposerBar.jsx", cb);
}

// 4b. Wire Inspector (?) and Tutorial buttons into TopBar.jsx
let tb = fs.readFileSync("client/src/components/TopBar.jsx", "utf8");
if (!tb.includes("onToggleInspector")) {
  tb = tb.replace(
    "export default function TopBar() {",
    "export default function TopBar({ inspectorActive = false, onToggleInspector = () => {}, onOpenTutorial = () => {} } = {}) {"
  );
  tb = tb.replace(
    `title="Show quick game commands"`,
    `title="Show quick game commands"\n          />\n          <button\n            onClick={onToggleInspector}\n            data-help-title="Help Me Inspector"\n            data-help="Turn this on and hover over any button or panel to learn what it does in plain English."\n            className={\`p-1.5 rounded border text-xs font-mono \${inspectorActive ? "bg-teal-500/30 border-teal-400 text-teal-200" : "bg-[#0f1419] border-slate-700 text-slate-300 hover:border-teal-400"}\`}\n            title="Help Me Inspector (hover anything for details)"\n          >\n            <HelpCircle className="w-4 h-4" />\n          </button>\n          <span className="hidden"`
  );
  tb = tb.replace(
    `<Sparkles className="w-4 h-4 text-amber-400" /> AI Provider &amp; Keys\n                </button>`,
    `<Sparkles className="w-4 h-4 text-amber-400" /> AI Provider &amp; Keys\n                </button>\n                <button\n                  onClick={() => { setNavMenuOpen(false); onOpenTutorial(); }}\n                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#0f1419] hover:border-teal-400 border border-slate-800 text-slate-200"\n                >\n                  <HelpCircle className="w-4 h-4 text-teal-400" /> Guided Walkthrough &amp; Presets\n                </button>`
  );
  fs.writeFileSync("client/src/components/TopBar.jsx", tb);
}

// 4c. Stamp usedModel & fellBack onto the latest narrator message in GameContext.jsx
let ctx = fs.readFileSync("client/src/context/GameContext.jsx", "utf8");
if (!ctx.includes("lastMsg.usedModel")) {
  ctx = ctx.replace(
    "return out.result;",
    `if (out.result?.campaignState?.chatLog?.length) {\n        const log = out.result.campaignState.chatLog;\n        const lastMsg = log[log.length - 1];\n        if (lastMsg && lastMsg.role === "narrator") {\n          lastMsg.usedModel = out.usedModel;\n          lastMsg.fellBack = out.fellBack;\n        }\n      }\n      return out.result;`
  );
  fs.writeFileSync("client/src/context/GameContext.jsx", ctx);
}

// 4d. Add Sticky Step 2 bar, backtick (`) example pitch insert, preset auto-fill, and Model Used badge in ChatPane.jsx
let cp = fs.readFileSync("client/src/components/ChatPane.jsx", "utf8");
if (!cp.includes("dl_preset_pitch")) {
  cp = cp.replace(
    "export default function ChatPane() {",
    "export default function ChatPane({ onOpenTutorial = () => {} } = {}) {"
  );
  cp = cp.replace(
    "const [pitchIdx, setPitchIdx] = useState(0);",
    `const [pitchIdx, setPitchIdx] = useState(0);\n  useEffect(() => {\n    const preset = localStorage.getItem("dl_preset_pitch");\n    if (preset && campaignState?.narratorState?.currentStep === "setting") {\n      setSetupForm((p) => ({ ...p, settingDescription: preset }));\n      localStorage.removeItem("dl_preset_pitch");\n    }\n  }, [campaignState?.narratorState?.currentStep]);`
  );
  cp = cp.replace(
    `<div className="flex-1 overflow-y-auto p-5 space-y-4">`,
    `{isSetup && step === "setting" && (campaignState.chatLog || []).length > 0 && (\n        <div className="shrink-0 px-4 py-2 bg-[#161d26]/95 border-b border-amber-500/30 flex items-center justify-between gap-2">\n          <span className="text-xs text-slate-300 truncate">Ready with your world?</span>\n          <button\n            onClick={() => runSetupStep("setting", { settingDescription: setupForm.settingDescription || campaignState.globalState?.settingDescription || "Custom World" })}\n            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0f1419] font-semibold text-xs shrink-0"\n          >\n            Lock World &amp; Continue →\n          </button>\n        </div>\n      )}\n      <div className="flex-1 overflow-y-auto p-5 space-y-4">`
  );
  cp = cp.replace(
    `placeholder={\`Try: "\${EXAMPLE_PITCHES[pitchIdx]}"\`}`,
    `onKeyDown={(e) => { if (e.key === "\`" && !setupForm.settingDescription.trim()) { e.preventDefault(); setSetupForm((p) => ({ ...p, settingDescription: EXAMPLE_PITCHES[pitchIdx] })); } }}\n              placeholder={\`Press \\\` to use: "\${EXAMPLE_PITCHES[pitchIdx]}"\`}`
  );
  cp = cp.replace(
    `<button\n                onClick={handleBrainstormSetting}`,
    `<button\n                type="button"\n                onClick={() => setSetupForm((p) => ({ ...p, settingDescription: EXAMPLE_PITCHES[pitchIdx] }))}\n                className="px-3 py-2 rounded-lg bg-[#0f1419] border border-slate-700 hover:border-teal-400 text-slate-300 text-xs"\n                title="Insert the currently scrolling example pitch"\n              >\n                Use Example (\`)\n              </button>\n              <button\n                onClick={handleBrainstormSetting}`
  );
  cp = cp.replace(
    "{msg.roll && <RollBadge roll={msg.roll} />}",
    `{msg.roll && <RollBadge roll={msg.roll} />}\n                {msg.usedModel && (\n                  <div className="mt-2 text-[10px] font-mono text-slate-500 text-right">\n                    {msg.fellBack ? \`Fallback: \${msg.usedModel}\` : \`GM: \${msg.usedModel}\`}\n                  </div>\n                )}`
  );
  fs.writeFileSync("client/src/components/ChatPane.jsx", cp);
}
'