// Renderiza una lista de comentarios ya extraídos como Markdown compacto,
// optimizado para bajo consumo de tokens y lectura por una IA:
// - Sin jerarquía de headers por carpeta (una sola línea "## <ruta completa>").
// - Sin timestamps (cada ronda de revisión ya vive en su propio archivo).
// - Notación de línea compacta: L303 (contexto), L303+ (añadida), L303- (eliminada).

function buildPrCommentsMarkdown(comments, meta) {
  const byFile = new Map();
  for (const c of comments) {
    if (!byFile.has(c.filePath)) byFile.set(c.filePath, []);
    byFile.get(c.filePath).push(c);
  }
  const files = Array.from(byFile.keys()).sort();

  const out = [];
  out.push(`repo: ${meta.repo || 'desconocido'}`);
  out.push(`target<-source: ${meta.target || '?'}<-${meta.source || '?'}`);
  out.push(`round: ${meta.round}`);
  out.push(`date: ${meta.date}`);
  out.push('legend: L<n>=context L<n>+=added L<n>-=removed (old numbering)');
  out.push('');

  for (const file of files) {
    out.push(`## ${file}`);
    const items = byFile.get(file).slice().sort((a, b) => a.sortKey - b.sortKey);
    for (const c of items) {
      out.push(`- ${c.line} [${c.author}]: ${c.body}`);
      if (c.diff) {
        out.push('  diff:');
        for (const line of c.diff.split('\n')) out.push(`  ${line}`);
      }
    }
    out.push('');
  }

  return out.join('\n').trim() + '\n';
}
