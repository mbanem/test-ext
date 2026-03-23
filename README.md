#### Svelte 5 VsCode Webview Extension

This is a minimal Webview extension.
It should

- create a panel and set panel.webview.html from a call to getHtml() which returns an HTML page that should load a main.ts starter code
- `<body>`
- &emsp;`<div id="app"></div>`
  &emsp;`<script`
  &emsp;&emsp;`type="module"`
  &emsp;&emsp;`src="http://localhost:5173/src/main.ts">`
  &emsp;`</script>`
  `</body>`
- which i turn mounts an App.svelte at id='app' in the above markup.

The App.svelte is a UI router containing no UI markup.
It imports all the component pages and has a listener called by the extension for dynamically maunting a page for a given component name.
Components collect information via user interface an send data to extension to carry on activities and call for the next component in a chain of commands.
