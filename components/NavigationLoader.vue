<script setup lang="ts">
const { isLoading } = useNavigationLoading()
</script>

<template>
  <Transition name="nav-fade">
    <div
      v-if="isLoading"
      class="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-ink-950/95 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <!-- スピナー: 二重リングを回す -->
      <div class="relative w-12 h-12">
        <div class="absolute inset-0 rounded-full border-2 border-accent/20"></div>
        <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-accent animate-spin"></div>
      </div>
      <p class="mt-4 text-[11px] text-ink-400 tracking-wide">読み込み中…</p>
    </div>
  </Transition>
</template>

<style scoped>
.nav-fade-enter-active,
.nav-fade-leave-active {
  transition: opacity 0.15s ease;
}
.nav-fade-enter-from,
.nav-fade-leave-to {
  opacity: 0;
}
</style>
