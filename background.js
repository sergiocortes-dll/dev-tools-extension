// Escucha peticiones salientes para capturar el header Authorization: Bearer <token>.
// El listener se registra siempre (requisito de MV3 para poder despertar el
// service worker); el flag bearerListening en storage.session decide si se
// actúa o no sobre lo que ve.

console.log('[PR Toolkit] background.js cargado, listener de webRequest registrado');

chrome.webRequest.onBeforeSendHeaders.addListener(
  async (details) => {
    const { bearerListening } = await chrome.storage.session.get('bearerListening');
    if (!bearerListening) return;

    const header = (details.requestHeaders || []).find(
      (h) => h.name.toLowerCase() === 'authorization'
    );
    if (!header || !header.value) {
      console.log('[PR Toolkit] petición sin header Authorization:', details.url);
      return;
    }

    console.log('[PR Toolkit] header Authorization visto en', details.url, '->', header.value);

    const match = /^Bearer\s+(.+)$/i.exec(header.value.trim());
    if (!match) return;

    await chrome.storage.session.set({
      bearerListening: false,
      bearerToken: match[1],
      bearerCapturedUrl: details.url,
    });
    console.log('[PR Toolkit] token capturado y guardado');
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders', 'extraHeaders']
);
