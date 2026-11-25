node -e '
const fs = require("fs");

// A. Patch server/engine/turnProcessor.js
const tp = "server/engine/turnProcessor.js";
let ts = fs.readFileSync(tp, "utf8");

ts = ts.replace(
  "  saveHandler,\n  onAsyncNpcPortrait,",
  "  saveHandler,\n  onAsyncNpcPortrait,\n  imageMode,\n  imageAccessToken = null,"
);

const oldHook = `    onTriggerAsyncPortrait: (npc) => {
      if (typeof onAsyncNpcPortrait === \x27function\x27) {
        onAsyncNpcPortrait(npc);
      }
      if (mediaPipeline && typeof mediaPipeline.generateNpcPortraitAsync === \x27function\x27) {
        const p = mediaPipeline.generateNpcPortraitAsync({
          uid: workingState.ownerUid,
          campaignId: workingState.id,
          npc,
          style: workingState.globalState?.narratorStyle,
          onComplete: async (res) => {
            npc.portraitRef = res.storagePath;
          },
        });
        asyncPortraitPromises.push(p);
      }
    },`;

const newHook = `    onTriggerAsyncPortrait: (npc) => {
      if (typeof onAsyncNpcPortrait === \x27function\x27) {
        onAsyncNpcPortrait(npc);
      }
      if (imageMode === \x27off\x27) return;
      const artPrompt = \`Character portrait of \${npc.name || npc.id} (\${npc.role || \x27key character\x27}) in \${workingState.globalState?.settingDescription || \x27this story world\x27}. Visual style: \${workingState.globalState?.narratorStyle || \x27Cinematic literary noir\x27}. High-detail waist-up portrait, expressive lighting, no text.\`;
      if (imageMode === \x27prompt_only\x27) {
        npc.portraitPrompt = artPrompt;
        return;
      }
      if (mediaPipeline && typeof mediaPipeline.generateNpcPortraitAsync === \x27function\x27) {
        const p = Promise.resolve(
          mediaPipeline.generateNpcPortraitAsync({
            uid: workingState.ownerUid,
            campaignId: workingState.id,
            npc,
            style: workingState.globalState?.narratorStyle,
            accessToken: imageAccessToken,
            onComplete: async (res) => {
              npc.portraitRef = res.storagePath;
            },
          })
        ).catch(() => {
          npc.portraitPrompt = artPrompt;
        });
        asyncPortraitPromises.push(p);
      }
    },`;

if (!ts.includes(oldHook)) { console.error("Missing oldHook in turnProcessor.js"); process.exit(1); }
ts = ts.replace(oldHook, newHook);
fs.writeFileSync(tp, ts);
console.log("Patched turnProcessor.js cleanly!");

// B. Patch server/routes/turnRoutes.js to pass imageMode & imageAccessToken
const trp = "server/routes/turnRoutes.js";
let trs = fs.readFileSync(trp, "utf8");
const trTarget = "      saveHandler,\n    });";
const trReplace = "      saveHandler,\n      imageMode: req.body?.imageMode || \x27prompt_only\x27,\n      imageAccessToken: typeof accessToken !== \x27undefined\x27 ? accessToken : null,\n    });";
if (!trs.includes(trTarget)) { console.error("Missing target in turnRoutes.js"); process.exit(1); }
trs = trs.replace(trTarget, trReplace);
fs.writeFileSync(trp, trs);
console.log("Patched turnRoutes.js cleanly!");

// C. Pass imageMode from localStorage in client/src/context/GameContext.jsx on submitTurn
const gcp = "client/src/context/GameContext.jsx";
let gcs = fs.readFileSync(gcp, "utf8");
if (!gcs.includes("delaval_image_mode")) {
  gcs = gcs.replace(
    "thinkingLevel,",
    "thinkingLevel,\n            imageMode: localStorage.getItem(\x27delaval_image_mode\x27) || \x27prompt_only\x27,"
  );
  fs.writeFileSync(gcp, gcs);
  console.log("Patched GameContext.jsx to send imageMode!");
}
' && node -c server/engine/turnProcessor.js && node -c server/routes/turnRoutes.js