import { mount, unmount } from 'svelte'
import App from './App.svelte'

console.log('Inside main.ts App loader')
const app = mount(App, {
  target: document.getElementById('app')!
})
// Optional: expose for cleanup / HMR in dev
if (import.meta.hot) {
  import.meta.hot.accept()
  import.meta.hot.dispose(() => unmount(app))
}
export default app