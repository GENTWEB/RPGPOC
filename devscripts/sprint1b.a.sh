node -e '
const fs = require("fs");
let cp = fs.readFileSync("client/src/components/ChatPane.jsx", "utf8");
cp = cp.replace(
  "selectedModel,\n    thinkingLevel,\n  } = useGame();",
  "selectedModel,\n    thinkingLevel,\n    involvementLevel,\n    setInvolvementLevel,\n    submitTurn,\n  } = useGame();"
);
cp = cp.replace(
  "message: setupForm.settingDescription,\n        model: selectedModel,\n        thinkingLevel,",
  "message: setupForm.settingDescription || (involvementLevel === 3 ? \"Help me pick a world using quick choices!\" : \"\"),\n        involvementLevel,\n        model: selectedModel,\n        thinkingLevel,"
);
cp = cp.replace(
  `<textarea
              rows={3}
              value={setupForm.settingDescription}`,
  `<div className="space-y-1.5">
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
                    className={\`p-2.5 rounded-lg border text-left transition \${
                      involvementLevel === opt.lvl
                        ? "bg-amber-500/15 border-amber-400 text-amber-200"
                        : "bg-[#0f1419] border-slate-700 text-slate-300 hover:border-slate-500"
                    }\`}
                  >
                    <div className="font-semibold">{opt.title}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={3}
              value={setupForm.settingDescription}`
);
cp = cp.replace(
  "disabled={!setupForm.settingDescription.trim() || Boolean(thinkingStatus) || busy}",
  "disabled={(involvementLevel !== 3 && !setupForm.settingDescription.trim()) || Boolean(thinkingStatus) || busy}"
);
cp = cp.replace(
  "<div>{renderFormattedText(msg.text)}</div>",
  `<div>{renderFormattedText(msg.text)}</div>
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
                )}`
);
fs.writeFileSync("client/src/components/ChatPane.jsx", cp);
'