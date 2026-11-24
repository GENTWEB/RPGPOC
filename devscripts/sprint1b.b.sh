node -e '
const fs = require("fs");
let cr = fs.readFileSync("server/routes/campaignRoutes.js", "utf8");
cr = cr.replace(
  /const systemPrompt = `You are a creative, approachable Game Master[\s\S]*?const userPrompt = `CURRENT WORLD IDEA:/,
  `const involvement = Number(req.body?.involvementLevel) || state.globalState?.involvementLevel || 1;
    state.globalState.involvementLevel = involvement;
    const prevSetupTurns = (state.chatLog || []).filter((m) => m.role === "narrator").length;

    let modeRule = "";
    if (involvement === 1) {
      modeRule = "MODE 1 (INFER EVERYTHING): Do NOT ask clarifying questions. Take the player\\x27s pitch, infer all missing world details, factions, rules, and tone creatively in one vivid 120-160 word summary, and end by telling them to click \\"Lock World & Continue\\" to move to character creation.";
    } else if (involvement === 2) {
      const remaining = Math.max(0, 6 - prevSetupTurns * 3);
      modeRule = remaining > 0
        ? \`MODE 2 (LIGHT Q&A): You may ask AT MOST \${Math.min(3, remaining)} concise clarifying questions (hard max 6 total across setup). If the player says "infer the rest" or "move on", ask ZERO questions and summarize the finished world so they can click "Lock World & Continue".\`
        : "MODE 2 LIMIT REACHED: You have already asked your maximum of 6 questions. Ask ZERO more questions. Synthesize the final cohesive world now and tell the player to click \\"Lock World & Continue\\" to build their character.";
    } else {
      modeRule = "MODE 3 (REVERSE 20 QUESTIONS — SUGGESTIONS ONLY): Do NOT ask open-ended essay questions. Instead, propose ONE quick multiple-choice fork (e.g., Past vs Present vs Future, or Real World vs Sci-Fi vs Fantasy) and end your message with a final line formatted EXACTLY as: @CHOICES: Option A | Option B | Option C | Surprise Me";
    }

    const systemPrompt = \`You are a creative, approachable Game Master helping a player set up a custom RPG world.
\${modeRule}
HARD RULES:
- NEVER output planning notes, scratchpad outlines, or word counts—write ONLY your direct reply to the player.
- NEVER invent a separate character-building quiz during world setup—the app has its own dedicated Character Creation step right after "Lock World & Continue".\`;

    const userPrompt = \`CURRENT WORLD IDEA:`
);

// Parse @CHOICES: line for Mode 3 clickable chips
cr = cr.replace(
  "state.chatLog.push({ id: `sn_${Date.now() + 1}`, role: \x27narrator\x27, text: reply, thinking: thinking || null, timestamp: now });",
  `let cleanReply = reply;
    let choices = [];
    const choiceMatch = reply.match(/@CHOICES:\\s*(.+)$/im);
    if (choiceMatch) {
      choices = choiceMatch[1].split("|").map((s) => s.trim()).filter(Boolean).slice(0, 5);
      cleanReply = reply.replace(/@CHOICES:\\s*.+$/im, "").trim();
    }
    state.chatLog.push({ id: \`sn_\${Date.now() + 1}\`, role: "narrator", text: cleanReply, choices, thinking: thinking || null, timestamp: now });`
);
fs.writeFileSync("server/routes/campaignRoutes.js", cr);
'