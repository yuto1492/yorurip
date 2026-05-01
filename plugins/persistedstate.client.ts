import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

// stores/*.ts 側で `persist: true` または `persist: { ... }` を書けるようにする。
// auth.client.ts より先に走り、最初の store 生成時には永続化フックが効いている状態にする。
export default defineNuxtPlugin({
  name: 'pinia-persistedstate',
  setup(nuxtApp) {
    // @ts-expect-error - $pinia は @pinia/nuxt が拡張している
    nuxtApp.$pinia.use(piniaPluginPersistedstate)
  },
})
