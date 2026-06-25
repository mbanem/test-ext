<script lang="ts">
  import { onMount } from 'svelte'
  type TProps = {
    line: string
    /** Two-way binding for checkbox state */
    isSelected?: boolean | undefined
    /** Alternative: callback when toggled */
    callback?: { callback: (_: string, __: boolean) => void; arg: string }
    cssClass?: string
  }
  // No default on $bindable → isSelected stays undefined if not passed
  let {
    line,
    isSelected = $bindable<boolean>(),
    callback,
    cssClass,
  }: TProps = $props()
  let selected = $state(false)
  function onClick() {
    selected = !selected
    if (isSelected !== undefined) {
      isSelected = selected
    }
    if (callback) {
      callback.callback(callback.arg, selected)
    }
  }
  onMount(() => {
    // Runtime validation: at least one control method must be provided
    if (isSelected === undefined && callback === undefined) {
      console.error(
        `[ClickableLine] ERROR: "${line}"\n` +
          `At least one of these optional props is required:\n` +
          `   • bind:isSelected={your $state variable}\n` +
          `   • callback={(payload:string, state:boolean) => void}\n` +
          `The line will not respond to clicks otherwise.`,
      )
      return
    }

    let lineEl = document.querySelector(`.${cssClass}`) as HTMLSpanElement
    if (!lineEl) {
      lineEl = document.querySelector('toggler') as HTMLSpanElement
    }
    lineEl.addEventListener('mousemove', (e: MouseEvent) => {
      const { x } = lineEl.getBoundingClientRect()
      // @ts-expect-error number not assignable to string, but it was a string
      const xpos = String(parseInt(e.clientX - x))
      lineEl.style.setProperty('--x', xpos)
    })
  })
</script>

<span
  class="toggler {cssClass}"
  style={cssClass}
  class:select={selected}
  onclick={onClick}
  onkeyup={() => {}}
  aria-hidden={true}>{line}</span
>

<style lang="scss">
  .toggler {
    position: relative;
    display: block;
    font-size: 14px;
    color: navy;
    transition: color 0.2s ease;
    &:hover {
      cursor: pointer;
      color: blue;
      &::after {
        position: absolute;
        content: 'click to toggle add';
        top: -1.5rem;
        left: calc(var(--x, 0) * 1px - 50px);
        width: max-content;
        font-size: 12px;
        padding: 0 0.5rem;
        color: blue;
        background-color: cornsilk;
        border: 1px solid gray;
        border-radius: 5px;
      }
    }
  }
  .select {
    color: tomato !important;
  }
</style>
