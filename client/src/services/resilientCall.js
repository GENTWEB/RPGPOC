const RETRY_DELAY_SECONDS = 13;

function isBusyError(err) {
  const msg = String(err?.message || err || '');
  return /\b(503|429|502)\b|UNAVAILABLE|high demand|overloaded|quota|NetworkError|aborted/i.test(msg);
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

/**
 * Resilient LLM Orchestrator:
 *   1. Try primaryModel (initial + 2x retry with 13s prime countdown).
 *   2. On failure, auto-swap to fallbackModel (gemini-3.5-flash-lite) for 2 attempts (13s countdown between).
 *   3. If all attempts fail, throws { exhausted: true, cooldownSeconds: 75 }.
 */
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
  // Phase 1: Primary model (1 initial + 2 retries = 3 tries)
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    if (cancelRef?.current) throw new Error('Request cancelled by user.');
    if (attempt === 0) {
      onStatus(initialStatus);
    } else {
      await sleepWithCountdown(
        RETRY_DELAY_SECONDS,
        (s) => `${primaryLabel} busy — retrying (${attempt}/2) in ${s}s...`,
        onStatus,
        cancelRef
      );
      onStatus(`Retrying ${primaryLabel} (${attempt}/2)...`);
    }

    try {
      const result = await invoke(primaryModel);
      return { result, usedModel: primaryModel, fellBack: false };
    } catch (err) {
      if (!isBusyError(err) || cancelRef?.current) throw err;
    }
  }

  // Phase 2: Fallback model (2 attempts with 13s countdown between)
  if (fallbackModel && fallbackModel !== primaryModel) {
    onStatus(`Retry failed — falling back to ${fallbackLabel} (trying 1/2)...`);
    for (let fbAttempt = 1; fbAttempt <= 2; fbAttempt += 1) {
      if (cancelRef?.current) throw new Error('Request cancelled by user.');
      if (fbAttempt === 2) {
        await sleepWithCountdown(
          RETRY_DELAY_SECONDS,
          (s) => `${fallbackLabel} busy — retrying (${fbAttempt}/2) in ${s}s...`,
          onStatus,
          cancelRef
        );
      }
      onStatus(`Falling back to ${fallbackLabel} — trying ${fbAttempt}/2...`);
      try {
        const result = await invoke(fallbackModel);
        return { result, usedModel: fallbackModel, fellBack: true };
      } catch (err) {
        if (!isBusyError(err) || cancelRef?.current) throw err;
      }
    }
  }

  const exhaustedErr = new Error(
    'All free attempts failed — switch to a paid tier in the GM menu or wait 75 seconds to try again.'
  );
  exhaustedErr.exhausted = true;
  exhaustedErr.cooldownSeconds = 75;
  throw exhaustedErr;
}
