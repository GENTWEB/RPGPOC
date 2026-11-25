const RETRY_DELAY_SECONDS = 13;

function getErrorReason(err) {
  const msg = String(err?.message || err || '');
  if (/\b503\b|UNAVAILABLE|high demand/i.test(msg)) return '503 High Demand';
  if (/\b429\b|quota|rate limit/i.test(msg)) return '429 Rate Limit';
  if (/\b502\b/i.test(msg)) return '502 Gateway';
  if (/aborted|timeout/i.test(msg)) return 'Timeout';
  if (/NetworkError|Failed to fetch/i.test(msg)) return 'Network';
  return null;
}

function sleepWithCountdown(seconds, labelBuilder, onStatus, cancelRef) {
  return new Promise((resolve, reject) => {
    let remaining = seconds;
    onStatus(labelBuilder(remaining));
    const interval = setInterval(() => {
      if (cancelRef?.current) {
        clearInterval(interval);
        reject(new Error('Request cancelled by user.'));
        return;
      }
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(interval);
        resolve();
      } else {
        onStatus(labelBuilder(remaining));
      }
    }, 1000);
  });
}

function buildFallbackChain(primaryModel, primaryLabel, fallbackModel, fallbackLabel) {
  const chain = [{ id: primaryModel, label: primaryLabel || primaryModel, retries: 2 }];

  // Try sibling Gemma 4 model first so prose voice stays consistent on free tier
  if (primaryModel === 'gemma-4-26b-a4b-it') {
    chain.push({ id: 'gemma-4-31b-it', label: 'Gemma 4 31B IT', retries: 1 });
  } else if (primaryModel === 'gemma-4-31b-it') {
    chain.push({ id: 'gemma-4-26b-a4b-it', label: 'Gemma 4 26B A4B IT', retries: 1 });
  }

  if (fallbackModel && !chain.some((m) => m.id === fallbackModel)) {
    chain.push({ id: fallbackModel, label: fallbackLabel || fallbackModel, retries: 2 });
  }
  return chain;
}

export async function runWithRetryAndFallback({
  primaryModel,
  fallbackModel = 'gemini-3.5-flash-lite',
  primaryLabel = primaryModel,
  fallbackLabel = 'Gemini 3.5 Flash-Lite',
  initialStatus = 'Game Master is weaving the next scene...',
  invoke,
  onStatus = () => {},
  cancelRef = null,
}) {
  const chain = buildFallbackChain(primaryModel, primaryLabel, fallbackModel, fallbackLabel);
  let lastError = null;

  for (let tierIdx = 0; tierIdx < chain.length; tierIdx += 1) {
    const tier = chain[tierIdx];
    const maxAttempts = 1 + tier.retries;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (cancelRef?.current) throw new Error('Request cancelled by user.');

      if (tierIdx === 0 && attempt === 1) {
        onStatus(initialStatus);
      } else if (attempt === 1) {
        onStatus(`Switching to ${tier.label} (attempt 1/${maxAttempts})...`);
      } else {
        onStatus(`${tier.label} — trying (${attempt - 1}/${tier.retries})...`);
      }

      try {
        const result = await invoke(tier.id);
        return { result, modelUsed: tier.id, fellBack: tierIdx > 0 };
      } catch (err) {
        lastError = err;
        const reason = getErrorReason(err);
        if (!reason || cancelRef?.current) {
          throw err;
        }
        if (attempt < maxAttempts) {
          await sleepWithCountdown(
            RETRY_DELAY_SECONDS,
            (sec) => `${tier.label} (${reason}) — retrying (${attempt}/${tier.retries}) in ${sec}s...`,
            onStatus,
            cancelRef
          );
        }
      }
    }
  }

  const finalErr = new Error(
    `All models are currently busy (${getErrorReason(lastError) || 'Unavailable'}). Please wait for the cooldown or switch to a paid tier.`
  );
  finalErr.triggerCooldown = true;
  throw finalErr;
}
