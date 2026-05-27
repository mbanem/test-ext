<script lang="ts">
  let triggeringEl: HTMLElement
  let msgEl: HTMLDivElement
  let message = $state('')
  let disabled = $state(false)

  export function showMessage(
    e: MouseEvent,
    msg: string,
    position: Position = undefined,
  ) {
    console.log('showing message', msg)
    if (!msgEl) {
      console.warn('msgEl not found')
      return
    }
    // while message is on ignore new requests
    if (disabled) {
      return
    }
    disabled = true
    message = msg

    try {
      triggeringEl = document.elementFromPoint(
        e.clientX,
        e.clientY,
      ) as HTMLElement
      if (!triggeringEl) {
        return
      }

      let { x, y } =
        position === undefined
          ? triggeringEl!.getBoundingClientRect()
          : position
      // position msgEl above the triggering element
      Object.assign(msgEl.style, {
        position: 'fixed',
        left: `${x}px`,
        top: `${y - 30}px`,
        zIndex: '10',
        pointerEvents: 'auto',
        opacity: '1',
        width: 'max-content',
        padding: '2px 1rem',
        textAlign: 'center',
        backgroundColor: 'aliceblue',
        borderRadius: '5px',
        color: 'navy',
      })
      setTimeout(() => {
        msgEl.style.opacity = '0'
        disabled = false
      }, 2000)
    } catch (err: unknown) {
      console.log('el not found', err)
    }
  }
</script>

<div bind:this={msgEl} class="msg">
  {message}
</div>

<style lang="scss">
  .msg {
    transition: opacity 0.5s ease-in;
  }
</style>
