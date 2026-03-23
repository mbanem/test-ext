<script lang="ts">
  import { vscode } from '$lib/utils/event-handler.browser'

  let payload = ''

  function send() {
    vscode.postMessage({
      command: 'input',
      payload,
    })
  }

  window.addEventListener('message', (event) => {
    const msg = event.data
    if (msg.command === 'reply') {
      alert(msg.text)
    }
  })
</script>

<input bind:value={payload} />
<button onclick={send} disabled={!payload}>Send</button>

<div class="box">Styled box</div>

<style lang="scss">
  .box {
    /*@include bordered;*/
    color: $primary;
    padding: 10px;
  }
  button {
    color: white;
    background-color: navy;
    padding: 1px 1rem;
    border-radius: 5px;
    &:disabled {
      color: gray;
      background-color: lightgray;
    }
  }
</style>
