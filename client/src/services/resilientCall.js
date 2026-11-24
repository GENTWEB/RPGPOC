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
  let lastReason = 'Busy';

  for (let attempt = 0; attempt <= 2; attempt += 1) {
    if (cancelRef?.current) throw new Error('Request cancelled by user.');
    if (attempt === 0) {
      onStatus(initialStatus);
    } else {
      await sleepWithCountdown(
        RETRY_DELAY_SECONDS,
        (s) => `${primaryLabel} (${lastReason}) — retrying (${attempt}/2) in ${s}s...`,
        onStatus,
        cancelRef
      );
      onStatus(`Retrying ${primaryLabel} (${attempt}/2)...`);
    }

    try {
      const result = await invoke(primaryModel);
      return { result, usedModel: primaryModel, fellBack: false };
    } catch (err) {
      const reason = getErrorReason(err);
      if (!reason || cancelRef?.current) throw err;
      lastReason = reason;
    }
  }

  if (fallbackModel && fallbackModel !== primaryModel) {
    onStatus(`${primaryLabel} (${lastReason}) — falling back to ${fallbackLabel} (1/2)...`);
    for (let fbAttempt = 1; fbAttempt <= 2; fbAttempt += 1) {
      if (cancelRef?.current) throw new Error('Request cancelled by user.');
      if (fbAttempt === 2) {
        await sleepWithCountdown(
          RETRY_DELAY_SECONDS,
          (s) => `${fallbackLabel} (${lastReason}) — retrying (2/2) in ${s}s...`,
          onStatus,
          cancelRef
        );
      }
      onStatus(`Falling back to ${fallbackLabel} — trying ${fbAttempt}/2...`);
      try {
        const result = await invoke(fallbackModel);
        return { result, usedModel: fallbackModel, fellBack: true };
      } catch (err) {
        const reason = getErrorReason(err);
        if (!reason || cancelRef?.current) throw err;
        lastReason = reason;
      }
    }
  }

  const exhaustedErr = new Error(
    `All free attempts failed (${lastReason}) — switch to a paid tier in the GM menu or wait 75 seconds.`
  );
  exhaustedErr.exhausted = true;
  exhaustedErr.cooldownSeconds = 75;
  throw exhaustedErr;
}
