// Viewer page served by GET /viewer. Loaded in a sandboxed iframe by the webui
// file pane; talks to the host over postMessage (`viewer.*` protocol) and to the
// draw.io embed editor over its official JSON postMessage protocol.
export const VIEWER_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Draw.io</title>
<style>
  :root { color-scheme: dark; }
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; font: 12px/1.4 system-ui, sans-serif; color: var(--foreground, #ecedef); background: var(--background, #0f1114); }
  #bar { display: flex; align-items: center; gap: 12px; padding: 6px 12px; border-bottom: 1px solid var(--border, #25282d); background: var(--card, #16191d); }
  #name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #spacer { flex: 1; }
  #status { color: var(--muted-foreground, #8a9098); white-space: nowrap; }
  #save { font: inherit; padding: 4px 14px; border: 1px solid var(--border, #25282d); border-radius: 6px; background: var(--background, #0f1114); color: var(--foreground, #ecedef); cursor: pointer; }
  #save:hover { background: var(--accent, #1c2025); }
  #save:disabled { opacity: 0.5; cursor: default; }
  #frame { flex: 1; border: 0; width: 100%; }
  #spinner { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--muted-foreground, #8a9098); }
  #spinner[hidden] { display: none; }
</style>
</head>
<body>
  <div id="bar">
    <span id="name">...</span>
    <span id="spacer"></span>
    <span id="status"></span>
    <button id="save" disabled>Save</button>
  </div>
  <div id="spinner">Loading editor...</div>
  <iframe id="frame" hidden sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"></iframe>
<script>
(function () {
  'use strict';

  var DRAWIO_BASE_URL = 'https://embed.diagrams.net';
  var AUTOSAVE_DEBOUNCE_MS = 800;

  var state = { content: null, path: '', dirty: false, editorReady: false, saving: false };
  var saveTimer = null;
  var currentDark = null;

  var nameEl = document.getElementById('name');
  var statusEl = document.getElementById('status');
  var saveEl = document.getElementById('save');
  var spinnerEl = document.getElementById('spinner');
  var frameEl = document.getElementById('frame');
  frameEl.addEventListener('load', function () { frameEl.hidden = false; spinnerEl.hidden = true; });

  function post(message) { window.parent.postMessage(message, window.location.origin); }

  function setStatus(text) { statusEl.textContent = text; }

  function editorPost(action) {
    frameEl.contentWindow.postMessage(JSON.stringify(action), '*');
  }

  function applyTheme(theme) {
    var root = document.documentElement;
    var colors = (theme && theme.colors) || {};
    Object.keys(colors).forEach(function (name) { root.style.setProperty(name, colors[name]); });
    var dark = !!(theme && theme.dark === true);
    root.style.colorScheme = dark ? 'dark' : 'light';
    if (dark === currentDark) { return; }
    currentDark = dark;
    state.editorReady = false;
    spinnerEl.hidden = false;
    frameEl.hidden = true;
    frameEl.src = DRAWIO_BASE_URL + '/?embed=1&proto=json&spin=1&libraries=1&noExitBtn=1&ui=min&dark=' + (dark ? '1' : '0');
  }

  function sendSave(content) {
    state.saving = true;
    saveEl.disabled = true;
    setStatus('Saving...');
    post({ type: 'viewer.save', content: content });
  }

  function markDirty(dirty) {
    state.dirty = dirty;
    saveEl.disabled = !dirty || state.saving;
    setStatus(dirty ? 'Unsaved changes' : 'Saved');
    post({ type: 'viewer.dirty', dirty: dirty });
  }

  function scheduleAutosave(xml) {
    if (state.content === null || xml === state.content) { return; }
    state.content = xml;
    markDirty(true);
    if (saveTimer !== null) { clearTimeout(saveTimer); }
    saveTimer = setTimeout(function () { sendSave(xml); }, AUTOSAVE_DEBOUNCE_MS);
  }

  saveEl.addEventListener('click', function () {
    if (state.content !== null && state.dirty) { sendSave(state.content); }
  });

  // --- host (parent) messages -------------------------------------------------
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent || typeof event.data !== 'object' || event.data === null) { return; }
    var data = event.data;
    if (data.type === 'viewer.init') {
      state.path = typeof data.path === 'string' ? data.path : '';
      state.content = typeof data.content === 'string' ? data.content : '';
      nameEl.textContent = state.path;
      applyTheme(data.theme);
      if (state.editorReady) { editorPost({ action: 'load', xml: state.content, autosave: 1 }); }
      return;
    }
    if (data.type === 'viewer.theme') {
      applyTheme(data.theme);
      return;
    }
    if (data.type === 'viewer.saved') {
      state.saving = false;
      if (saveTimer !== null) { clearTimeout(saveTimer); saveTimer = null; }
      if (data.ok === true) {
        state.dirty = false;
        saveEl.disabled = true;
        setStatus('Saved');
        editorPost({ action: 'status', modified: false });
      } else {
        saveEl.disabled = false;
        setStatus('Save failed: ' + (typeof data.error === 'string' ? data.error : 'unknown error'));
      }
      return;
    }
  });

  // --- draw.io embed editor messages (JSON strings) ---------------------------
  window.addEventListener('message', function (event) {
    if (event.source !== frameEl.contentWindow || typeof event.data !== 'string') { return; }
    var msg;
    try { msg = JSON.parse(event.data); } catch (e) { return; }
    if (!msg || typeof msg !== 'object') { return; }
    if (msg.event === 'init') {
      state.editorReady = true;
      if (state.content !== null) { editorPost({ action: 'load', xml: state.content, autosave: 1 }); }
      return;
    }
    if (msg.event === 'save' && typeof msg.xml === 'string') {
      state.content = msg.xml;
      sendSave(msg.xml);
      return;
    }
    if (msg.event === 'autosave' && typeof msg.xml === 'string') {
      scheduleAutosave(msg.xml);
      return;
    }
  });

  post({ type: 'viewer.ready' });
})();
</script>
</body>
</html>
`;
