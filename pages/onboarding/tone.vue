<script setup lang="ts">
definePageMeta({
  title: '口調学習',
  pageTransition: { name: 'slide-left', mode: 'out-in', appear: false },
})
useHead({ title: '口調学習 | ヨルリプ' })
</script>

<template>
  <ToneLearningWizard flow-name="ステップ 3/3" done-redirect="/" />
</template>
