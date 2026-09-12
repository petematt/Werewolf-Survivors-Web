// Haptic feedback manager using HTML5 Vibration API

let hapticsEnabled = true;

export function setHapticsEnabled(enabled: boolean) {
  hapticsEnabled = enabled;
}

export function isHapticsSupported(): boolean {
  return typeof window !== 'undefined' && 'vibrate' in navigator;
}

export function vibrateHit() {
  if (!hapticsEnabled || !isHapticsSupported()) return;
  try {
    navigator.vibrate(12);
  } catch {
    // Ignore error if vibration blocked
  }
}

export function vibrateCrit() {
  if (!hapticsEnabled || !isHapticsSupported()) return;
  try {
    navigator.vibrate([20, 30, 20]);
  } catch {
    // Ignore
  }
}

export function vibratePlayerDamage() {
  if (!hapticsEnabled || !isHapticsSupported()) return;
  try {
    navigator.vibrate(50);
  } catch {
    // Ignore
  }
}

export function vibrateTransformation() {
  if (!hapticsEnabled || !isHapticsSupported()) return;
  try {
    navigator.vibrate([40, 50, 40, 50, 60]);
  } catch {
    // Ignore
  }
}

export function vibrateBossSpawn() {
  if (!hapticsEnabled || !isHapticsSupported()) return;
  try {
    navigator.vibrate([100, 50, 100, 50, 150]);
  } catch {
    // Ignore
  }
}

export function vibrateLevelUp() {
  if (!hapticsEnabled || !isHapticsSupported()) return;
  try {
    navigator.vibrate([30, 40, 60]);
  } catch {
    // Ignore
  }
}
