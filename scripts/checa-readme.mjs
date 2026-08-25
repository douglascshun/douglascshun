/**
 * Verifica os links e imagens dos READMEs.
 *
 * Existe porque três defeitos passaram despercebidos ao mesmo tempo:
 *  - um <a> sem fechar engolia a foto e a jogava para a âncora errada;
 *  - URLs de serviço morto / assinatura expirada continuavam no arquivo;
 *  - o conserto foi aplicado no README.md e esquecido no .en e no .es.
 *
 * Uso: node scripts/checa-readme.mjs [--externo]
 *   --externo também bate nas URLs http (lento; fora do CI por ser instável).
 */
import { readFileSync, existsSync } from 'node:fs'
import { readdirSync } from 'node:fs'

const ARQUIVOS = readdirSync('.').filter((f) => /^README(\.[a-z]{2})?\.md$/.test(f)).sort()

/** Hosts que já nos quebraram: servem imagem hoje e 40x amanhã. */
const PROIBIDOS = [
  [/github-readme-activity-graph\.vercel\.app/, 'serviço fora do ar desde 08/2026 (402, billing do mantenedor)'],
  [/media\.licdn\.com/, 'URL assinada do LinkedIn: expira e vira 403 permanente'],
  [/github-contributor-stats\.vercel\.app/, 'serviço fora do ar (402)'],
]

const problemas = []
const anota = (arq, linha, msg) => problemas.push(`${arq}:${linha}  ${msg}`)

/** Ancoras que o GitHub gera: <a id>/<a name> e o slug de cada heading. */
function ancorasDe(s) {
  const set = new Set()
  for (const m of s.matchAll(/<a\b[^>]*\b(?:id|name)="([^"]+)"/gi)) set.add(m[1].toLowerCase())
  for (const m of s.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    set.add(m[1].trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-'))
  }
  return set
}

for (const arq of ARQUIVOS) {
  const s = readFileSync(arq, 'utf8')
  const linhaDe = (pos) => s.slice(0, pos).split('\n').length
  const ancoras = ancorasDe(s)

  for (const [re, motivo] of PROIBIDOS) {
    for (const m of s.matchAll(new RegExp(re.source, 'g'))) anota(arq, linhaDe(m.index), `URL proibida (${motivo}): ${m[0]}`)
  }

  const pilha = []
  for (const m of s.matchAll(/<a\b[^>]*>|<\/a>|<img\b[^>]*>/gi)) {
    const tag = m[0], linha = linhaDe(m.index)
    if (/^<a/i.test(tag)) {
      pilha.push({ linha, href: (tag.match(/href="([^"]*)"/i) || [])[1], fim: m.index + tag.length })
    } else if (tag.toLowerCase() === '</a>') {
      const a = pilha.pop()
      if (!a) { anota(arq, linha, '</a> sem <a> correspondente'); continue }
      // Um link inline não deveria atravessar uma linha em branco: sinal de <a> não fechado
      if (a.href && /\n[ \t]*\n/.test(s.slice(a.fim, m.index))) {
        anota(arq, a.linha, `<a href="${a.href}"> provavelmente não foi fechado — engole o conteúdo até a linha ${linha}`)
      }
    } else {
      const alvo = pilha.length ? pilha[pilha.length - 1] : null
      if (alvo && (alvo.href === undefined || alvo.href.trim() === '' || alvo.href.trim() === '#')) {
        anota(arq, linha, 'imagem clicável sem destino (href vazio)')
      }
    }
  }
  for (const a of pilha) anota(arq, a.linha, `<a href="${a.href}"> nunca é fechado`)

  // Todo href: âncora existe? arquivo relativo existe?
  for (const m of s.matchAll(/href="([^"]+)"/gi)) {
    const href = m[1], linha = linhaDe(m.index)
    if (href.startsWith('#')) {
      if (!ancoras.has(href.slice(1).toLowerCase())) anota(arq, linha, `âncora inexistente: ${href}`)
    } else if (!/^(https?:|mailto:|tel:)/i.test(href)) {
      const caminho = href.split('#')[0].split('?')[0]
      if (caminho && !existsSync(caminho)) anota(arq, linha, `arquivo relativo inexistente: ${caminho}`)
    }
  }

  // src relativo (imagens do repo) precisa existir
  for (const m of s.matchAll(/<img\b[^>]*src="([^"]+)"/gi)) {
    const src = m[1]
    if (!/^(https?:|data:)/i.test(src) && !existsSync(src.split('?')[0])) {
      anota(arq, linhaDe(m.index), `imagem inexistente no repo: ${src}`)
    }
  }
}

if (process.argv.includes('--externo')) {
  const urls = new Set()
  for (const arq of ARQUIVOS) {
    for (const m of readFileSync(arq, 'utf8').matchAll(/(?:href|src)="(https?:\/\/[^"]+)"/gi)) urls.add(m[1])
  }
  // 999/429 = anti-bot (LinkedIn, TryHackMe), não link quebrado
  const TOLERADOS = new Set([999, 429, 403])
  await Promise.all([...urls].map(async (u) => {
    try {
      const r = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (!r.ok && !TOLERADOS.has(r.status)) problemas.push(`(externo) HTTP ${r.status}  ${u}`)
    } catch (e) { problemas.push(`(externo) falhou: ${u} — ${e.message}`) }
  }))
}

console.log(`Arquivos verificados: ${ARQUIVOS.join(', ')}`)
if (problemas.length) {
  console.error(`\n${problemas.length} problema(s):`)
  for (const p of problemas) console.error('  ' + p)
  process.exit(1)
}
console.log('Nenhum problema de link ou imagem.')
