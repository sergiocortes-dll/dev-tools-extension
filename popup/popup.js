// Función inyectada en la pestaña activa vía chrome.scripting.executeScript.
// Debe ser autocontenida (sin closures sobre variables externas): todo lo
// que necesita vive dentro de su propio cuerpo.
function extractPageData() {
  function collapseWhitespace(text) {
    return text.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  }

  function pathFromLineAnchorId(idValue) {
    return idValue.replace(/^L/, '').replace(/(F\d+T\d+|F\d+|T\d+)$/, '');
  }

  function extractFilePath(fileBlock) {
    const anchor = fileBlock.querySelector('[id^="L"]');
    return anchor ? pathFromLineAnchorId(anchor.id) : '(archivo desconocido)';
  }

  function lineMarkerLabel(marker) {
    if (!marker) return 'L?';
    if (marker.newLine != null && marker.oldLine != null) return 'L' + marker.newLine;
    if (marker.newLine != null) return 'L' + marker.newLine + '+';
    if (marker.oldLine != null) return 'L' + marker.oldLine + '-';
    return 'L?';
  }

  function lineSortKey(marker) {
    if (!marker) return Number.MAX_SAFE_INTEGER;
    if (marker.newLine != null) return marker.newLine;
    if (marker.oldLine != null) return marker.oldLine;
    return Number.MAX_SAFE_INTEGER;
  }

  function extractComment(commentNode, filePath, marker) {
    const docEl = commentNode.querySelector('.ak-renderer-document');
    if (!docEl) return null;

    const codeBlockEl = docEl.querySelector('[data-code-lang="diff"]');
    let diff = null;
    if (codeBlockEl) {
      diff = (codeBlockEl.textContent || '').replace(/\n+$/, '').replace(/^\n+/, '');
    }

    const clone = docEl.cloneNode(true);
    const codeBlockWrapper = clone.querySelector('.code-block');
    if (codeBlockWrapper) codeBlockWrapper.remove();
    const body = collapseWhitespace(clone.textContent || '');
    if (!body) return null;

    const authorEl = commentNode.querySelector('[aria-label^="More information about "]');
    const author = authorEl
      ? authorEl.getAttribute('aria-label').replace('More information about ', '')
      : 'desconocido';

    return {
      id: commentNode.id,
      filePath: filePath,
      line: lineMarkerLabel(marker),
      sortKey: lineSortKey(marker),
      author: author,
      body: body,
      diff: diff,
    };
  }

  function walkFileBlock(fileBlock, filePath, results) {
    let lastMarker = null;
    const walker = document.createTreeWalker(fileBlock, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      if (node.matches && node.matches('[data-key="code-line-number"]')) {
        lastMarker = {
          oldLine: node.dataset.oldLineNumber ? Number(node.dataset.oldLineNumber) : null,
          newLine: node.dataset.newLineNumber ? Number(node.dataset.newLineNumber) : null,
        };
      } else if (node.id && /^comment-\d+$/.test(node.id)) {
        const comment = extractComment(node, filePath, lastMarker);
        if (comment) results.push(comment);
      }
      node = walker.nextNode();
    }
  }

  function collectComments() {
    const results = [];
    document.querySelectorAll('[data-qa="bk-file__content"]').forEach(function (fileBlock) {
      const filePath = extractFilePath(fileBlock);
      walkFileBlock(fileBlock, filePath, results);
    });
    return results;
  }

  function detectRepo() {
    const cloud = location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull-requests\/(\d+)/);
    if (cloud) return { repo: cloud[2], prNumber: cloud[3] };
    const server = location.pathname.match(/\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)/);
    if (server) return { repo: server[2], prNumber: server[3] };
    return { repo: '', prNumber: '' };
  }

  // Selectores confirmados contra el encabezado real de Bitbucket Cloud:
  // data-qa="pr-branches-and-state-styles" contiene dos botones "Branch: X",
  // el segundo (o el que tiene aria-label="Change destination branch") es el destino.
  function detectBranches() {
    const container = document.querySelector('[data-qa="pr-branches-and-state-styles"]');
    if (!container) return { source: '', target: '' };

    const branchDivs = Array.prototype.slice.call(
      container.querySelectorAll('div[role="button"][aria-haspopup="true"]')
    );

    function clean(el) {
      const span = el.querySelector('span');
      const text = span ? span.textContent.trim() : '';
      return text.replace(/^Branch:\s*/, '').trim();
    }

    let destDiv = null;
    for (const d of branchDivs) {
      if (/destination/i.test(d.getAttribute('aria-label') || '')) {
        destDiv = d;
        break;
      }
    }
    const target = destDiv ? clean(destDiv) : '';

    let srcDiv = null;
    for (const d of branchDivs) {
      if (d !== destDiv) {
        srcDiv = d;
        break;
      }
    }
    const source = srcDiv ? clean(srcDiv) : '';

    return { source, target };
  }

  const comments = collectComments();
  const repoInfo = detectRepo();
  const branches = detectBranches();

  return {
    comments: comments,
    meta: {
      url: location.href,
      repo: repoInfo.repo,
      prNumber: repoInfo.prNumber,
      target: branches.target,
      source: branches.source,
    },
  };
}

// ---------------------------------------------------------------------
// Lógica del popup
// ---------------------------------------------------------------------

const state = {
  comments: [],
  checked: new Set(),
  pageUrl: '',
};

const els = {
  repo: document.getElementById('repo'),
  target: document.getElementById('target'),
  source: document.getElementById('source'),
  pathPreview: document.getElementById('path-preview'),
  list: document.getElementById('list'),
  emptyState: document.getElementById('empty-state'),
  count: document.getElementById('count'),
  status: document.getElementById('status'),
  extractBtn: document.getElementById('extract'),
};

function sanitizeSegment(name) {
  return (name || '').replace(/[\\/:*?"<>|]/g, '-').trim();
}

function updatePathPreview() {
  const repo = sanitizeSegment(els.repo.value) || 'repo-desconocido';
  const target = sanitizeSegment(els.target.value) || 'destino-desconocido';
  const sourceSegments = (els.source.value || 'origen-desconocido')
    .split('/')
    .map(sanitizeSegment)
    .filter(Boolean);
  const source = sourceSegments.join('/') || 'origen-desconocido';
  const today = new Date().toISOString().slice(0, 10);
  els.pathPreview.textContent = `Se guardará en: ${repo}/${target}/${source}/${today}__(siguiente).md`;
}

function setStatus(text, isError) {
  els.status.textContent = text;
  els.status.style.color = isError ? '#bf2600' : '#44546f';
}

function renderList() {
  els.list.innerHTML = '';
  if (state.comments.length === 0) {
    els.emptyState.hidden = false;
    updateCount();
    return;
  }
  els.emptyState.hidden = true;

  const byFile = new Map();
  for (const c of state.comments) {
    if (!byFile.has(c.filePath)) byFile.set(c.filePath, []);
    byFile.get(c.filePath).push(c);
  }
  const files = Array.from(byFile.keys()).sort();

  for (const file of files) {
    const group = document.createElement('div');
    group.className = 'file-group';

    const title = document.createElement('div');
    title.className = 'file-group__name';
    title.textContent = file;
    group.appendChild(title);

    const items = byFile.get(file).slice().sort((a, b) => a.sortKey - b.sortKey);
    for (const comment of items) {
      const row = document.createElement('label');
      row.className = 'comment-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = state.checked.has(comment.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.checked.add(comment.id);
        else state.checked.delete(comment.id);
        updateCount();
      });

      const lineTag = document.createElement('span');
      lineTag.className = 'line-tag';
      lineTag.textContent = comment.line;

      const snippet = document.createElement('span');
      snippet.className = 'snippet';
      snippet.textContent = comment.body;

      row.appendChild(checkbox);
      row.appendChild(lineTag);
      row.appendChild(snippet);
      group.appendChild(row);
    }

    els.list.appendChild(group);
  }

  updateCount();
}

function updateCount() {
  els.count.textContent = `${state.checked.size} / ${state.comments.length} seleccionados`;
}

async function loadSavedMeta(url) {
  return new Promise((resolve) => {
    chrome.storage.local.get([url], (res) => resolve(res[url] || null));
  });
}

function saveMeta(url, meta) {
  chrome.storage.local.set({ [url]: meta });
}

async function scan() {
  setStatus('Escaneando página...');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    setStatus('No se pudo acceder a la pestaña activa.', true);
    return;
  }

  let result;
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageData,
    });
    result = injection.result;
  } catch (err) {
    setStatus('No se pudo leer la página (¿es una pestaña de Bitbucket?): ' + err.message, true);
    return;
  }

  state.comments = result.comments;
  state.checked = new Set(result.comments.map((c) => c.id));
  state.pageUrl = result.meta.url;

  const saved = await loadSavedMeta(state.pageUrl);
  els.repo.value = (saved && saved.repo) || result.meta.repo || '';
  els.target.value = (saved && saved.target) || result.meta.target || '';
  els.source.value = (saved && saved.source) || result.meta.source || '';

  renderList();
  updatePathPreview();
  setStatus(result.comments.length ? '' : 'Sin comentarios visibles.');
}

async function getRootHandle() {
  return idbGet('rootHandle');
}

async function ensurePath(root, segments) {
  let dir = root;
  for (const seg of segments) {
    for (const part of String(seg).split('/').map(sanitizeSegment).filter(Boolean)) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
  }
  return dir;
}

async function nextRoundNumber(dir) {
  let max = 0;
  for await (const name of dir.keys()) {
    const m = name.match(/__(\d+)\.md$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function extract() {
  const root = await getRootHandle();
  if (!root) {
    setStatus('Configura primero la carpeta raíz en Opciones.', true);
    chrome.runtime.openOptionsPage();
    return;
  }

  const selected = state.comments.filter((c) => state.checked.has(c.id));
  if (selected.length === 0) {
    setStatus('No hay comentarios seleccionados.', true);
    return;
  }

  const repo = els.repo.value.trim() || 'repo-desconocido';
  const target = els.target.value.trim() || 'destino-desconocido';
  const source = els.source.value.trim() || 'origen-desconocido';
  saveMeta(state.pageUrl, { repo, target, source });

  try {
    setStatus('Solicitando permiso de escritura...');
    const permission = await root.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      setStatus('Permiso denegado para escribir en la carpeta configurada.', true);
      return;
    }

    const dir = await ensurePath(root, [repo, target, source]);
    const round = await nextRoundNumber(dir);
    const filename = `${todayStr()}__${round}.md`;

    const markdown = buildPrCommentsMarkdown(selected, {
      repo,
      target,
      source,
      round,
      date: todayStr(),
    });

    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(markdown);
    await writable.close();

    setStatus(`Guardado: ${repo}/${target}/${source}/${filename}`);
  } catch (err) {
    setStatus('Error al guardar: ' + err.message, true);
  }
}

document.getElementById('rescan').addEventListener('click', scan);
document.getElementById('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.getElementById('extract').addEventListener('click', extract);
document.getElementById('check-all').addEventListener('click', () => {
  state.checked = new Set(state.comments.map((c) => c.id));
  renderList();
});
document.getElementById('uncheck-all').addEventListener('click', () => {
  state.checked.clear();
  renderList();
});
[els.repo, els.target, els.source].forEach((input) => input.addEventListener('input', updatePathPreview));

// ---------------------------------------------------------------------
// Navegación entre la pantalla principal (selección de funcionalidad) y
// las vistas de cada herramienta. Por ahora solo existe "extractor".
// ---------------------------------------------------------------------

const homeView = document.getElementById('home-view');
const extractorView = document.getElementById('extractor-view');
const bearerView = document.getElementById('bearer-view');
const allViews = [homeView, extractorView, bearerView];

function showView(view) {
  allViews.forEach((v) => (v.hidden = v !== view));
}

function showHome() {
  showView(homeView);
}

function showExtractor() {
  showView(extractorView);
  scan();
}

function showBearer() {
  showView(bearerView);
  refreshBearerView();
}

document.querySelectorAll('.back-home').forEach((btn) => btn.addEventListener('click', showHome));
document.querySelectorAll('.btn[data-feature]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.feature === 'extractor') showExtractor();
    else if (btn.dataset.feature === 'bearer') showBearer();
  });
});
document.querySelectorAll('.section-toggle').forEach((toggle) => {
  toggle.addEventListener('click', () => toggle.closest('.btns').classList.toggle('collapsed'));
});

// ---------------------------------------------------------------------
// Interceptor de Bearer token: el listener real vive en background.js
// (debe seguir registrado aunque el popup se cierre). Aquí solo se
// controla el flag bearerListening en storage.session y se muestra el
// resultado capturado.
// ---------------------------------------------------------------------

const bearerEls = {
  status: document.getElementById('bearer-status'),
  toggle: document.getElementById('bearer-toggle'),
  clear: document.getElementById('bearer-clear'),
  result: document.getElementById('bearer-result'),
  token: document.getElementById('bearer-token'),
  copy: document.getElementById('bearer-copy'),
};

async function refreshBearerView() {
  const { bearerListening, bearerToken, bearerCapturedUrl } = await chrome.storage.session.get([
    'bearerListening',
    'bearerToken',
    'bearerCapturedUrl',
  ]);

  bearerEls.toggle.textContent = bearerListening ? 'Detener escucha' : 'Iniciar escucha';

  if (bearerToken) {
    bearerEls.status.textContent = `Token capturado desde: ${bearerCapturedUrl}`;
    bearerEls.result.hidden = false;
    bearerEls.token.value = bearerToken;
  } else if (bearerListening) {
    bearerEls.status.textContent = 'Escuchando... ejecuta la petición con el token en la web.';
    bearerEls.result.hidden = true;
  } else {
    bearerEls.status.textContent = 'Detenido. Pulsa "Iniciar escucha" y luego ejecuta la petición en la web.';
    bearerEls.result.hidden = true;
  }
}

bearerEls.toggle.addEventListener('click', async () => {
  const { bearerListening } = await chrome.storage.session.get('bearerListening');
  if (bearerListening) {
    await chrome.storage.session.set({ bearerListening: false });
  } else {
    await chrome.storage.session.set({ bearerListening: true, bearerToken: null, bearerCapturedUrl: null });
  }
  refreshBearerView();
});

bearerEls.clear.addEventListener('click', async () => {
  await chrome.storage.session.set({ bearerToken: null, bearerCapturedUrl: null });
  refreshBearerView();
});

bearerEls.copy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(bearerEls.token.value);
  bearerEls.copy.textContent = 'Copiado ✓';
  setTimeout(() => (bearerEls.copy.textContent = 'Copiar'), 1200);
});

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'session' && !bearerView.hidden) refreshBearerView();
});
