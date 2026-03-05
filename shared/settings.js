// shared/settings.js — Shared settings defaults and normalization

(function () {
  const DEFAULT_SETTINGS = {
    extensionEnabled: true,
    protection: {
      enabled: false,
      challengeType: "passcode",
      passcodeHash: null,
      mathDifficulty: "easy"
    },
    exceptions: {
      enabled: false,
      allowedDurations: [5, 15, 30],
      customDurationMinutes: null,
      wordChallenge: {
        enabled: false,
        requiredCorrect: 3,
        rewardMinutes: 5
      }
    }
  };

  function cloneDefaults() {
    if (typeof structuredClone === "function") {
      return structuredClone(DEFAULT_SETTINGS);
    }
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  function clampInteger(value, fallback, min, max) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function normalizeOptionalInteger(value, min, max) {
    if (value === null || value === undefined || value === "") return null;
    const asNumber = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isInteger(asNumber)) return null;
    if (asNumber < min || asNumber > max) return null;
    return asNumber;
  }

  function normalizeSettings(input) {
    const defaults = cloneDefaults();
    const allowedExceptionDurations = new Set([5, 15, 30]);
    const settings = (input && typeof input === "object") ? input : {};

    const protection = (settings.protection && typeof settings.protection === "object")
      ? settings.protection
      : {};
    const exceptions = (settings.exceptions && typeof settings.exceptions === "object")
      ? settings.exceptions
      : {};
    const wordChallenge = (exceptions.wordChallenge && typeof exceptions.wordChallenge === "object")
      ? exceptions.wordChallenge
      : {};

    return {
      extensionEnabled: settings.extensionEnabled !== false,
      protection: {
        enabled: !!protection.enabled,
        challengeType: protection.challengeType === "math" ? "math" : "passcode",
        passcodeHash: typeof protection.passcodeHash === "string" ? protection.passcodeHash : null,
        mathDifficulty: ["easy", "medium", "hard"].includes(protection.mathDifficulty)
          ? protection.mathDifficulty
          : defaults.protection.mathDifficulty
      },
      exceptions: {
        enabled: !!exceptions.enabled,
        allowedDurations: Array.isArray(exceptions.allowedDurations) && exceptions.allowedDurations.length
          ? exceptions.allowedDurations
              .map(v => Number.parseInt(v, 10))
              .filter(v => Number.isFinite(v) && allowedExceptionDurations.has(v))
          : defaults.exceptions.allowedDurations,
        customDurationMinutes: normalizeOptionalInteger(exceptions.customDurationMinutes, 1, 720),
        wordChallenge: {
          enabled: !!wordChallenge.enabled,
          requiredCorrect: clampInteger(
            wordChallenge.requiredCorrect,
            defaults.exceptions.wordChallenge.requiredCorrect,
            1,
            10
          ),
          rewardMinutes: clampInteger(
            wordChallenge.rewardMinutes,
            defaults.exceptions.wordChallenge.rewardMinutes,
            1,
            120
          )
        }
      }
    };
  }

  globalThis.URLBLOCKER_DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  globalThis.getDefaultSettings = cloneDefaults;
  globalThis.normalizeSettings = normalizeSettings;
})();
