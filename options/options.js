const pickBtn = document.getElementById('pick');
const currentEl = document.getElementById('current');
const warningEl = document.getElementById('warning');

if (typeof window.showDirectoryPicker !== 'function') {
  warningEl.hidden = false;
  pickBtn.disabled = true;
}

pickBtn.addEventListener('click', async () => {
  try {
    const handle = await window.showDirectoryPicker();
    await idbSet('rootHandle', handle);
    currentEl.textContent = `Carpeta actual: ${handle.name}`;
  } catch (err) {
    if (err.name !== 'AbortError') {
      currentEl.textContent = `Error al seleccionar carpeta: ${err.message}`;
    }
  }
});

(async () => {
  const handle = await idbGet('rootHandle');
  if (handle) currentEl.textContent = `Carpeta actual: ${handle.name}`;
})();
