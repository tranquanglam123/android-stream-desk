import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export type DisplayFitMode = 'contain' | 'cover' | 'fullscreen';

export const DISPLAY_FIT_MODES: DisplayFitMode[] = ['contain', 'cover', 'fullscreen'];

export const DEFAULT_FIT_MODE: DisplayFitMode = 'contain';
const FIT_MODE_KEY = 'settings:displayFitMode';

// 0 = never dim. Mirrors the "sleep" behaviour of hardware decks: the panel
// fades out after an idle gap and the first tap only wakes it.
export const IDLE_DIM_OPTIONS = [0, 30, 60, 120, 300] as const;
export type IdleDimSeconds = (typeof IDLE_DIM_OPTIONS)[number];
export const DEFAULT_IDLE_DIM: IdleDimSeconds = 60;
const IDLE_DIM_KEY = 'settings:idleDimSeconds';

export function parseIdleDim(raw: string | null | undefined): IdleDimSeconds {
  // Guard before Number(): both null and '' coerce to 0, which is a *valid*
  // option here ("never dim"), so an unset key would silently disable dimming.
  if (raw === null || raw === undefined || raw.trim() === '') {
    return DEFAULT_IDLE_DIM;
  }
  const n = Number(raw);
  if ((IDLE_DIM_OPTIONS as readonly number[]).includes(n)) {
    return n as IdleDimSeconds;
  }
  return DEFAULT_IDLE_DIM;
}

export function parseFitMode(raw: string | null | undefined): DisplayFitMode {
  if (raw && (DISPLAY_FIT_MODES as string[]).includes(raw)) {
    return raw as DisplayFitMode;
  }
  return DEFAULT_FIT_MODE;
}

function readFitMode(): DisplayFitMode {
  try {
    return parseFitMode(localStorage.getItem(FIT_MODE_KEY));
  } catch (_) {
    return DEFAULT_FIT_MODE;
  }
}

export const useSettingsStore = defineStore('settings', () => {
  let initialKeepScreenOn = false;
  try {
    initialKeepScreenOn = JSON.parse(localStorage.getItem('settings:keepScreenOn') ?? 'false');
  } catch (_) {}

  let initialVibrate = true;
  try {
    initialVibrate = JSON.parse(localStorage.getItem('settings:vibrateOnClick') ?? 'true');
  } catch (_) {}

  let initialSound = true;
  try {
    initialSound = JSON.parse(localStorage.getItem('settings:soundOnClick') ?? 'true');
  } catch (_) {}

  const keepScreenOn = ref<boolean>(initialKeepScreenOn);
  const vibrateOnClick = ref<boolean>(initialVibrate);
  const soundOnClick = ref<boolean>(initialSound);
  const displayFitMode = ref<DisplayFitMode>(readFitMode());

  let initialIdleDim: IdleDimSeconds = DEFAULT_IDLE_DIM;
  try {
    initialIdleDim = parseIdleDim(localStorage.getItem(IDLE_DIM_KEY));
  } catch (_) {}
  const idleDimSeconds = ref<IdleDimSeconds>(initialIdleDim);

  watch(keepScreenOn, val => {
    localStorage.setItem('settings:keepScreenOn', JSON.stringify(val));
  });

  watch(vibrateOnClick, val => {
    localStorage.setItem('settings:vibrateOnClick', JSON.stringify(val));
  });

  watch(soundOnClick, val => {
    localStorage.setItem('settings:soundOnClick', JSON.stringify(val));
  });

  watch(displayFitMode, val => {
    try {
      localStorage.setItem(FIT_MODE_KEY, val);
    } catch (_) {}
  });

  watch(idleDimSeconds, val => {
    try {
      localStorage.setItem(IDLE_DIM_KEY, String(val));
    } catch (_) {}
  });

  return { keepScreenOn, vibrateOnClick, soundOnClick, displayFitMode, idleDimSeconds };
});
