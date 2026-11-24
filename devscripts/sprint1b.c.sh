node -e '
const fs = require("fs");
let ctx = fs.readFileSync("client/src/context/GameContext.jsx", "utf8");
if (!ctx.includes("involvementLevel")) {
  ctx = ctx.replace(
    "const [thinkingLevel, setThinkingLevel] = useState(\x27Mid\x27);",
    "const [thinkingLevel, setThinkingLevel] = useState(\x27Mid\x27);\n  const [involvementLevel, setInvolvementLevel] = useState(1);"
  );
  ctx = ctx.replace(
    "message: userInput,\n            model: selectedModel,\n            thinkingLevel,",
    "message: userInput,\n            involvementLevel,\n            model: selectedModel,\n            thinkingLevel,"
  );
  ctx = ctx.replace(
    "else if (res.systemMessage) {\n        notify(res.systemMessage, \x27info\x27);\n      }\n    } catch (err) {",
    "else if (res.systemMessage) {\n        notify(res.systemMessage, \x27info\x27);\n      }\n      return true;\n    } catch (err) {"
  );
  ctx = ctx.replace(
    "notify(err.message, \x27error\x27);\n    } finally {",
    "notify(err.message, \x27error\x27);\n      return false;\n    } finally {"
  );
  ctx = ctx.replace(
    "thinkingLevel,\n    setThinkingLevel,",
    "thinkingLevel,\n    setThinkingLevel,\n    involvementLevel,\n    setInvolvementLevel,"
  );
  fs.writeFileSync("client/src/context/GameContext.jsx", ctx);
}
'