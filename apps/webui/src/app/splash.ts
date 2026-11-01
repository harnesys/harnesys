const SPLASH_MIN_MS = 1200;
const SPLASH_MAX_MS = 2000;
const SPLASH_FADE_MS = 400;
const splashShownAt = performance.now();

export function dismissSplash(): void {
  const splash = document.getElementById('app-splash');
  if (!splash) {
    return;
  }
  const elapsed = performance.now() - splashShownAt;
  const delay = Math.max(0, Math.min(SPLASH_MIN_MS - elapsed, SPLASH_MAX_MS - elapsed));
  window.setTimeout(() => {
    splash.classList.add('is-done');
    window.setTimeout(() => splash.remove(), SPLASH_FADE_MS);
  }, delay);
}
