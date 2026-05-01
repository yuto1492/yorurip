<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'ja' },
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <!-- ページ遷移中のフルスクリーンローダー (page:start / page:finish hook と連動) -->
  <NavigationLoader />
</template>
