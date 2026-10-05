<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';

// Dims the deck after an idle gap, the way a hardware deck's panel sleeps. The
// overlay itself swallows the waking tap so the first touch after sleep never
// fires a macro by accident.
const props = defineProps<{
  // 0 disables dimming entirely.
  seconds: number;
  hint?: string;
}>();

const dimmed = ref(false);
let timer = 0;

function clearTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = 0;
  }
}

function arm() {
  clearTimer();
  if (!props.seconds || props.seconds <= 0) return;
  timer = window.setTimeout(() => {
    dimmed.value = true;
  }, props.seconds * 1000);
}

function onActivity() {
  // While dimmed the overlay owns the next tap, so ignore the window-level copy.
  if (dimmed.value) return;
  arm();
}

function wake() {
  dimmed.value = false;
  arm();
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') wake();
}

onMounted(() => {
  arm();
  window.addEventListener('pointerdown', onActivity, true);
  window.addEventListener('keydown', onActivity, true);
  document.addEventListener('visibilitychange', onVisibilityChange);
});

onUnmounted(() => {
  clearTimer();
  window.removeEventListener('pointerdown', onActivity, true);
  window.removeEventListener('keydown', onActivity, true);
  document.removeEventListener('visibilitychange', onVisibilityChange);
});

// Setting changed in the panel: drop any current dim and re-arm on the new gap.
watch(
  () => props.seconds,
  () => {
    dimmed.value = false;
    arm();
  },
);
</script>

<template>
  <Transition name="idle-dim">
    <div
      v-if="dimmed"
      class="idle-dim fixed inset-0 z-[90] flex items-center justify-center"
      @pointerdown.stop.prevent="wake"
    >
      <div class="idle-dim__hint flex flex-col items-center gap-2">
        <Icon icon="mdi:gesture-tap" class="text-3xl" />
        <span class="text-[10px] font-bold uppercase tracking-[0.25em]">{{ hint }}</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.idle-dim {
  background: rgba(2, 6, 23, 0.55);
  /* brightness() keeps the grid faintly visible instead of a flat black sheet */
  backdrop-filter: brightness(0.22) saturate(0.5);
  -webkit-backdrop-filter: brightness(0.22) saturate(0.5);
  cursor: pointer;
}

.idle-dim__hint {
  color: var(--theme-accent, #06b6d4);
  opacity: 0.45;
  text-shadow: 0 0 10px currentColor;
  animation: idle-breathe 3s ease-in-out infinite;
}

@keyframes idle-breathe {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 0.12;
  }
}

/* Slow fade in matches a screen dimming down; the wake is quick. */
.idle-dim-enter-active {
  transition: opacity 0.8s ease;
}

.idle-dim-leave-active {
  transition: opacity 0.18s ease;
}

.idle-dim-enter-from,
.idle-dim-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .idle-dim__hint {
    animation: none;
  }
}
</style>
