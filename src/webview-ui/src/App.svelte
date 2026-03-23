<script lang="ts">
  import OrmOne from './OrmOne.svelte'
  import OrmTwo from './OrmTwo.svelte'
  import OrmThree from './OrmThree.svelte'
  import { type Component } from 'svelte'

  type TPage = Record<string, Component>
  let key = $state('OrmOne')
  const pages: TPage = {
    OrmOne: OrmOne,
    OrmTwo: OrmTwo,
    OrmThree: OrmThree,
  }
  let current = $derived({ component: pages[key] })

  console.log('inside App.svelte')

  window.addEventListener('message', (event) => {
    const msg = event.data

    if (msg.command === 'showPage') {
      current = msg.page
    }
  })
  // set current='OrmOne' until the communication extension<-->webview is established
  // let current: keyof typeof pages | null = 'OrmOne'
</script>

{#if current}
  <!-- <svelte:component this={pages[current]} /> -->
  <current.component></current.component>
{/if}
