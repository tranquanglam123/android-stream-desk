<script setup lang="ts">
import { onMounted, onUnmounted, nextTick, ref, watch, computed } from 'vue';
import { useLayoutStore } from '../stores/layout';
import { useConnectionStore } from '../stores/connection';
import GridButton from './GridButton.vue';

import { useSettingsStore } from '../stores/settings';
import { playClick } from '../lib/clicksound';
import type { DisplayFitMode } from '../stores/settings';
import type { ButtonConfig } from '../types';

const props = defineProps<{
  viewportKey?: number;
}>();

const layoutStore = useLayoutStore();
const settingsStore = useSettingsStore();
const connectionStore = useConnectionStore();

const fitMode = computed<DisplayFitMode>(() => settingsStore.displayFitMode);
const isFullscreen = computed(() => fitMode.value === 'fullscreen');
const isCover = computed(() => fitMode.value === 'cover');
// `contain` keeps the existing cap (max-w-2xl) so the deck never explodes on a
// 4K monitor. `cover`/`fullscreen` let the grid fill the whole viewport.
const applyContainMaxWidth = computed(() => fitMode.value === 'contain');

const scrollerRef = ref<HTMLElement | null>(null);

watch(() => props.viewportKey, () => {
  nextTick(() => {
    scrollToIndex(layoutStore.currentPageIndex);
  });
});

// --- Per-key press feedback ---------------------------------------------
// 'ok' is optimistic: the press reached the companion socket. 'error' comes
// from the companion's own toast, correlated back to the key that was pressed
// within ERROR_WINDOW_MS.
const ACK_MS = 400;
const ERROR_MS = 400;
const ERROR_WINDOW_MS = 2000;

const feedback = ref<Record<string, 'ok' | 'error'>>({});
const feedbackTimers = new Map<string, number>();
let lastPress: { id: string; at: number } | null = null;

function setFeedback(id: string, kind: 'ok' | 'error', ms: number) {
  const prev = feedbackTimers.get(id);
  if (prev) clearTimeout(prev);
  // Drop then re-add on the next frame so a repeated press replays the
  // animation instead of the element staying mounted and static.
  delete feedback.value[id];
  requestAnimationFrame(() => {
    feedback.value[id] = kind;
    const timer = window.setTimeout(() => {
      feedbackTimers.delete(id);
      delete feedback.value[id];
    }, ms);
    feedbackTimers.set(id, timer);
  });
}

// Fires on pointerdown so the finger gets haptic + click sound with no wait
// for pointerup or the socket round-trip.
function handlePressStart(button: ButtonConfig) {
  if (button.buttonKind === 'monitor') return;

  if (settingsStore.soundOnClick) {
    playClick();
  }

  if (settingsStore.vibrateOnClick && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(20);
    } catch (_) {}
  }
}

function handlePress(button: Parameters<typeof layoutStore.pressButton>[0]) {
  if (button.buttonKind === 'monitor') return;

  lastPress = { id: button.id, at: Date.now() };
  layoutStore.pressButton(button);

  // Only claim success when the socket is actually up; a queued press has not
  // run anything yet, so no confirmation ring is shown for it.
  if (connectionStore.status === 'connected') {
    setFeedback(button.id, 'ok', ACK_MS);
  }
}

watch(
  () => layoutStore.lastToast,
  (toast) => {
    if (!toast || toast.kind !== 'error' || !lastPress) return;
    if (Date.now() - lastPress.at > ERROR_WINDOW_MS) return;
    setFeedback(lastPress.id, 'error', ERROR_MS);
  }
);

// --- Page name flash -----------------------------------------------------
const pageFlash = ref<string | null>(null);
let pageFlashTimer = 0;

watch(
  () => layoutStore.currentPageIndex,
  (idx) => {
    const pages = layoutStore.layout.pages || [];
    if (pages.length < 2) return;
    const name = pages[idx]?.name?.trim();
    if (!name) return;
    pageFlash.value = name;
    if (pageFlashTimer) clearTimeout(pageFlashTimer);
    pageFlashTimer = window.setTimeout(() => {
      pageFlash.value = null;
    }, 1100);
  }
);

function pageFromScroll(el: HTMLElement): number {
  if (el.clientWidth === 0) return layoutStore.currentPageIndex;
  return Math.round(el.scrollLeft / el.clientWidth);
}

function scrollToIndex(idx: number) {
  const el = scrollerRef.value;
  if (!el) return;
  el.scrollTo({ left: idx * el.clientWidth, behavior: 'auto' });
}

// Native scroll-snap → layoutStore. Throttle to one pending rAF so a swipe's
// scroll-event burst collapses into a single setPage when it settles.
let rafId = 0;
let rafPending = false;
function onScroll() {
  if (rafPending) return;
  rafPending = true;
  rafId = requestAnimationFrame(() => {
    rafPending = false;
    const el = scrollerRef.value;
    if (!el) return;
    const idx = pageFromScroll(el);
    if (idx !== layoutStore.currentPageIndex) {
      layoutStore.setPage(idx);
    }
  });
}

// Rotate/resize: pages are clientWidth-wide but scrollLeft is in px, so realign
// the snap to currentPageIndex when the viewport changes size.
function onResize() {
  scrollToIndex(layoutStore.currentPageIndex);
}

onMounted(() => {
  // clientWidth can be 0 before first layout (mounted under v-if); defer so the
  // initial scroll lands on currentPageIndex instead of px 0 → page 0.
  const el = scrollerRef.value;
  if (el && el.clientWidth > 0) {
    scrollToIndex(layoutStore.currentPageIndex);
  } else {
    nextTick(() => scrollToIndex(layoutStore.currentPageIndex));
  }
  window.addEventListener('resize', onResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  if (rafId) cancelAnimationFrame(rafId);
  feedbackTimers.forEach((t) => clearTimeout(t));
  feedbackTimers.clear();
  if (pageFlashTimer) clearTimeout(pageFlashTimer);
});

// Index changed by dot tap / action / Dashboard. Guard: skip scrollTo when the
// snap is already there (swipe-driven change) to avoid fighting native momentum.
watch(
  () => layoutStore.currentPageIndex,
  (newIdx) => {
    const el = scrollerRef.value;
    if (!el) return;
    if (pageFromScroll(el) !== newIdx) {
      scrollToIndex(newIdx);
    }
  }
);

// Pages count changes via broadcast (Dashboard add/remove page). flush:'post'
// runs after the v-for DOM patch so the slide set is realigned to currentPageIndex.
watch(
  () => layoutStore.layout.pages?.length ?? 0,
  () => {
    scrollToIndex(layoutStore.currentPageIndex);
  },
  { flush: 'post' }
);

// Fit mode changes padding/gap → clientWidth changes but doesn't fire a resize
// event, so scrollLeft (px) drifts from the page edge. nextTick waits for the
// new layout then realigns.
watch(fitMode, () => {
  nextTick(() => scrollToIndex(layoutStore.currentPageIndex));
});
</script>

<template>
  <div
    class="w-full flex-1 flex flex-col items-center justify-center min-h-0 min-w-0 select-none"
    :class="[
      isFullscreen
        ? 'p-0 sm:p-0'
        : isCover
          ? 'p-2 sm:p-3'
          : 'p-4 sm:p-0 sm:pt-4',
    ]"
  >
    <!-- Stream Deck Cyberpunk Shell -->
    <div
      class="cyber-shell relative w-full h-full flex flex-col items-center justify-center overflow-hidden"
      :class="{
        'max-w-2xl': applyContainMaxWidth,
        'shell--fullscreen': isFullscreen,
        'theme-genshin-shell': layoutStore.layout.theme === 'genshin-01'
      }"
    >
      <!-- Scanline overlay (hidden in fullscreen) -->
      <div
        v-if="!isFullscreen"
        class="scanline absolute inset-0 pointer-events-none opacity-[0.04]"
      />

      <!-- Subtle animated grid bg (hidden in fullscreen) -->
      <div
        v-if="!isFullscreen"
        class="absolute inset-0 pointer-events-none opacity-[0.03] bg-grid-dot"
      />

      <!-- Corner neon brackets (hidden in fullscreen) -->
      <template v-if="!isFullscreen && layoutStore.layout.theme !== 'genshin-01'">
        <span
          class="absolute top-3 left-3 w-5 h-5 border-t-[3px] border-l-[3px] pointer-events-none z-20"
          :style="{ borderColor: 'var(--theme-corner-a)' }"
        />
        <span
          class="absolute top-3 right-3 w-5 h-5 border-t-[3px] border-r-[3px] pointer-events-none z-20"
          :style="{ borderColor: 'var(--theme-corner-b)' }"
        />
        <span
          class="absolute bottom-3 left-3 w-5 h-5 border-b-[3px] border-l-[3px] pointer-events-none z-20"
          :style="{ borderColor: 'var(--theme-corner-b)' }"
        />
        <span
          class="absolute bottom-3 right-3 w-5 h-5 border-b-[3px] border-r-[3px] pointer-events-none z-20"
          :style="{ borderColor: 'var(--theme-corner-a)' }"
        />
      </template>

      <!-- Native scroll-snap viewport (no JS carousel engine) -->
      <div
        ref="scrollerRef"
        class="scroller w-full h-full overflow-x-auto overflow-y-hidden relative z-10"
        @scroll.passive="onScroll"
      >
        <!-- Horizontal track -->
        <div class="flex h-full w-full">
          <!-- Snap page per layout page -->
          <div
            v-for="page in (layoutStore.layout.pages || [])"
            :key="page.id"
            class="snap-page flex-none w-full h-full"
            :class="[
              isFullscreen
                ? 'p-2 sm:p-3'
                : isCover
                  ? 'p-3 sm:p-4'
                  : 'p-5 sm:p-6',
            ]"
          >
            <div
              class="grid w-full h-full max-w-full max-h-full items-stretch justify-items-stretch min-h-0 min-w-0"
              :class="[
                isFullscreen ? 'gap-1.5 sm:gap-2' : isCover ? 'gap-2 sm:gap-3' : 'gap-3 sm:gap-4',
              ]"
              :style="{
                gridTemplateColumns: `repeat(${layoutStore.layout.cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${layoutStore.layout.rows}, minmax(0, 1fr))`,
              }"
            >
              <GridButton
                v-for="btn in page.buttons"
                :key="btn.id"
                :button="btn"
                :compact="isFullscreen || isCover"
                instant-press
                :feedback="feedback[btn.id]"
                @press="handlePress"
                @press-start="handlePressStart"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Page name flash on swipe -->
      <Transition name="page-flash">
        <div
          v-if="pageFlash"
          class="page-flash absolute left-1/2 top-4 z-30 -translate-x-1/2 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] pointer-events-none"
          :style="{
            color: 'var(--theme-accent, #06b6d4)',
            borderColor: 'var(--theme-accent, #06b6d4)',
          }"
        >
          {{ pageFlash }}
        </div>
      </Transition>

      <!-- Neon Dots Pagination (compact + offset for fullscreen bottom safe-area) -->
      <div
        v-if="layoutStore.layout.pages && layoutStore.layout.pages.length > 1"
        class="absolute left-0 right-0 z-30 flex items-center justify-center gap-2 pointer-events-auto"
        :class="[
          isFullscreen
            ? 'bottom-1 pb-[env(safe-area-inset-bottom)]'
            : 'bottom-3',
        ]"
      >
        <button
          v-for="(_, idx) in layoutStore.layout.pages"
          :key="idx"
          class="w-2.5 h-2.5 rounded-full transition-all duration-300 focus:outline-none border"
          :style="{
            backgroundColor: layoutStore.currentPageIndex === idx ? 'var(--theme-accent, #06b6d4)' : 'transparent',
            borderColor: 'var(--theme-accent, #06b6d4)',
            boxShadow: layoutStore.currentPageIndex === idx ? '0 0 8px var(--theme-accent, #06b6d4)' : 'none',
            opacity: layoutStore.currentPageIndex === idx ? '1' : '0.4'
          }"
          @click="layoutStore.setPage(idx)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.cyber-shell {
  background:
    radial-gradient(ellipse at 50% 0%, var(--theme-shell-top) 0%, transparent 60%),
    radial-gradient(ellipse at 50% 100%, var(--theme-shell-bottom) 0%, transparent 60%),
    var(--theme-shell-bg);
  border: 1px solid var(--theme-shell-border);
  border-radius: var(--theme-btn-radius);
  box-shadow:
    0 0 0 1px var(--theme-shell-border),
    0 4px 40px -8px rgba(0, 0, 0, 0.6),
    0 0 80px -16px var(--theme-shell-top),
    inset 0 0 40px -16px var(--theme-shell-top);
  clip-path: var(--theme-shell-clip-path);
}

.scroller {
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

.scroller::-webkit-scrollbar {
  display: none;
}

/* Fullscreen: drop the rounded shell + clip-path so the grid reaches every edge
   of the device viewport. Safe-area handled via env() on the parent. */
.shell--fullscreen {
  border-radius: 0;
  border: none;
  box-shadow: none;
  clip-path: none;
}

.snap-page {
  scroll-snap-align: center;
  scroll-snap-stop: always;
}

.bg-grid-dot {
  background-image: radial-gradient(circle, var(--theme-shell-top) 1px, transparent 1px);
  background-size: 24px 24px;
}

.scanline {
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    var(--theme-shell-top) 2px,
    var(--theme-shell-top) 3px
  );
}

:deep(.cyber-ghost) {
  opacity: 0.25;
  transition: opacity 0.15s;
}

.page-flash {
  border: 1px solid;
  border-radius: 9999px;
  background: rgba(2, 6, 23, 0.72);
  backdrop-filter: blur(6px);
  text-shadow: 0 0 8px currentColor;
}

.page-flash-enter-active,
.page-flash-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.page-flash-enter-from,
.page-flash-leave-to {
  opacity: 0;
  transform: translate(-50%, -6px);
}

.theme-genshin-shell {
  box-shadow:
    0 10px 30px -10px rgba(0, 0, 0, 0.7),
    inset 0 0 0 1px rgba(211, 188, 142, 0.1) !important;
}
</style>
