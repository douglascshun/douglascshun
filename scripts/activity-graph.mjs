/**
 * Gera o gráfico de atividade do GitHub como SVG estático.
 *
 * Substitui github-readme-activity-graph.vercel.app, que saiu do ar em 08/2026
 * (402 DEPLOYMENT_DISABLED — billing do mantenedor). Aqui o SVG é gerado pela
 * Action e commitado na branch `output`, servido pelo raw.githubusercontent:
 * nenhum serviço de terceiro no caminho, mesmo padrão do snake.yml.
 */

/** Geometria do plot. O zero em y=344 espelha o layout do gráfico original. */
export const PLOT = { width: 1000, height: 400, left: 62, right: 26, top: 96, baseline: 344 }

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))

/** Arredonda para 2 casas — mantém o SVG legível no diff do git. */
const r = (n) => Math.round(n * 100) / 100

/**
 * Achata as semanas da GraphQL nos últimos `dias` dias.
 * `ate` (YYYY-MM-DD) descarta o resto da semana corrente, que a API devolve
 * completa e zerada — sem isso o gráfico despenca no fim toda semana.
 */
export function buildSeries(calendar, dias = 31, ate = null) {
  const todos = (calendar?.weeks ?? []).flatMap((w) =>
    (w.contributionDays ?? []).map((d) => ({ date: d.date, count: d.contributionCount ?? 0 })),
  )
  const ateAqui = ate ? todos.filter((d) => d.date <= ate) : todos
  return ateAqui.slice(-dias)
}

/** Tangentes de Fritsch–Carlson: curva suave que nunca ultrapassa os pontos. */
function tangentesMonotonas(xs, ys) {
  const n = xs.length
  if (n < 2) return new Array(n).fill(0)
  const dx = [], dy = [], decl = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1] - xs[i]
    dy[i] = ys[i + 1] - ys[i]
    decl[i] = dx[i] === 0 ? 0 : dy[i] / dx[i]
  }
  const m = [decl[0]]
  for (let i = 1; i < n - 1; i++) {
    m[i] = decl[i - 1] * decl[i] <= 0 ? 0 : (decl[i - 1] + decl[i]) / 2
  }
  m[n - 1] = decl[n - 2]
  // Poda que garante a monotonicidade (evita o overshoot que inventaria picos)
  for (let i = 0; i < n - 1; i++) {
    if (decl[i] === 0) { m[i] = 0; m[i + 1] = 0; continue }
    const a = m[i] / decl[i], b = m[i + 1] / decl[i]
    const h = Math.hypot(a, b)
    if (h > 3) { m[i] = (3 / h) * a * decl[i]; m[i + 1] = (3 / h) * b * decl[i] }
  }
  return m
}

function caminhoSuave(pts) {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
  const m = tangentesMonotonas(xs, ys)
  let d = `M ${r(xs[0])},${r(ys[0])}`
  for (let i = 0; i < pts.length - 1; i++) {
    const h = (xs[i + 1] - xs[i]) / 3
    d += ` C ${r(xs[i] + h)},${r(ys[i] + m[i] * h)} ${r(xs[i + 1] - h)},${r(ys[i + 1] - m[i + 1] * h)} ${r(xs[i + 1])},${r(ys[i + 1])}`
  }
  return d
}

const rotuloData = (iso) => {
  const [, mes, dia] = iso.split('-')
  return `${Number(dia)} ${MESES[Number(mes) - 1]}`
}

export function renderSVG(serie, opts = {}) {
  const {
    username = '', bg = '#000000', color = '#1987F0',
    line = '#ffffff', point = '#ffffff', titulo = 'Contribuições',
  } = opts

  const { width, height, left, right, top, baseline } = PLOT
  const n = serie.length
  const max = Math.max(0, ...serie.map((d) => d.count))
  const alturaUtil = baseline - top
  // max === 0: série toda zerada assenta na baseline em vez de virar NaN
  const yDe = (v) => (max === 0 ? baseline : baseline - (v / max) * alturaUtil)
  const xDe = (i) => (n === 1 ? left : left + (i * (width - left - right)) / (n - 1))

  const pts = serie.map((d, i) => ({ x: xDe(i), y: yDe(d.count), ...d }))
  const curva = caminhoSuave(pts)
  const area = `${curva} L ${r(pts.at(-1).x)},${baseline} L ${r(pts[0].x)},${baseline} Z`

  const NIVEIS = 4
  const grade = Array.from({ length: NIVEIS + 1 }, (_, i) => {
    const y = baseline - (i * alturaUtil) / NIVEIS
    const valor = max === 0 ? 0 : Math.round((i * max) / NIVEIS)
    return `<line x1="${left}" y1="${r(y)}" x2="${width - right}" y2="${r(y)}" stroke="${line}" stroke-opacity="0.09"/>
    <text x="${left - 12}" y="${r(y + 4.5)}" text-anchor="end" class="eixo">${valor}</text>`
  }).join('\n    ')

  // ~6 rótulos no eixo X: 31 datas não cabem lado a lado
  const passo = Math.max(1, Math.ceil(n / 6))
  const datas = pts
    .filter((_, i) => i % passo === 0 || i === n - 1)
    .map((p) => `<text x="${r(p.x)}" y="${baseline + 30}" text-anchor="middle" class="eixo">${rotuloData(p.date)}</text>`)
    .join('\n    ')

  const bolinhas = pts
    .map((p) => `<circle cx="${r(p.x)}" cy="${r(p.y)}" r="3.2" fill="${point}"><title>${esc(p.date)}: ${p.count}</title></circle>`)
    .join('\n    ')

  const total = serie.reduce((s, d) => s + d.count, 0)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de contribuições de ${esc(username)}: ${total} nos últimos ${n} dias">
  <style>
    .titulo { font: 600 22px 'Segoe UI', Ubuntu, Helvetica, sans-serif; fill: ${line}; }
    .sub    { font: 400 13px 'Segoe UI', Ubuntu, Helvetica, sans-serif; fill: ${color}; }
    .eixo   { font: 400 12px 'Segoe UI', Ubuntu, Helvetica, sans-serif; fill: ${line}; fill-opacity: 0.55; }
  </style>
  <defs>
    <linearGradient id="preenchimento" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.06"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="${bg}"/>
  <text x="${left - 12}" y="52" class="titulo">${esc(titulo)}</text>
  <text x="${left - 12}" y="72" class="sub">${esc(username)} · ${total} nos últimos ${n} dias</text>
  <g>
    ${grade}
  </g>
  <path d="${area}" fill="url(#preenchimento)"/>
  <path d="${curva}" fill="none" stroke="${line}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <g>
    ${bolinhas}
  </g>
  <g>
    ${datas}
  </g>
</svg>
`
}

/** Busca o calendário de contribuições. Inclui as privadas se o perfil as expõe. */
export async function buscarCalendario(login, token, dias = 31) {
  const to = new Date()
  const from = new Date(to.getTime() - (dias + 7) * 864e5)
  const query = `query($login:String!,$from:DateTime!,$to:DateTime!){
    user(login:$login){ contributionsCollection(from:$from,to:$to){
      contributionCalendar{ weeks{ contributionDays{ date contributionCount } } } } } }`

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'activity-graph' },
    body: JSON.stringify({ query, variables: { login, from: from.toISOString(), to: to.toISOString() } }),
  })
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${await res.text()}`)
  const json = await res.json()
  if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`)
  const cal = json.data?.user?.contributionsCollection?.contributionCalendar
  if (!cal) throw new Error(`Sem calendário para "${login}"`)
  return cal
}

// --- execução direta -------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const { writeFileSync, mkdirSync } = await import('node:fs')
  const { dirname } = await import('node:path')

  const login = process.env.GH_USER || 'douglascshun'
  const token = process.env.GH_TOKEN
  const saida = process.env.SAIDA || 'dist/activity-graph.svg'
  const dias = Number(process.env.DIAS || 31)
  if (!token) throw new Error('GH_TOKEN ausente')

  const cal = await buscarCalendario(login, token, dias)
  const serie = buildSeries(cal, dias, new Date().toISOString().slice(0, 10))
  if (serie.length === 0) throw new Error('Série vazia — a API não devolveu dias')

  const svg = renderSVG(serie, {
    username: login,
    bg: process.env.BG || '#000000',
    color: process.env.COR || '#1987F0',
    line: process.env.LINHA || '#ffffff',
    point: process.env.PONTO || '#ffffff',
  })
  mkdirSync(dirname(saida), { recursive: true })
  writeFileSync(saida, svg)
  const total = serie.reduce((s, d) => s + d.count, 0)
  console.log(`${saida}: ${serie.length} dias, ${total} contribuições (${serie[0].date} → ${serie.at(-1).date})`)
}
