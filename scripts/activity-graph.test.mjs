import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSeries, renderSVG, PLOT, hojeEm } from './activity-graph.mjs'

/** Calendário sintético no formato que a GraphQL devolve. */
const calendario = (pares) => ({
  weeks: [{ contributionDays: pares.map(([date, contributionCount]) => ({ date, contributionCount })) }],
})

const ISO = (d) => d.toISOString().slice(0, 10)
const diasSeq = (n, valor = (i) => i, inicio = '2026-07-01') =>
  Array.from({ length: n }, (_, i) => [ISO(new Date(Date.parse(inicio) + i * 864e5)), valor(i)])

test('buildSeries devolve exatamente os N últimos dias, em ordem', () => {
  const s = buildSeries(calendario(diasSeq(40)), 31)
  assert.equal(s.length, 31)
  assert.equal(s[0].date, '2026-07-10')
  assert.equal(s.at(-1).date, '2026-08-09')
})

test('buildSeries preserva as contagens', () => {
  const s = buildSeries(calendario(diasSeq(31, (i) => i * 2)), 31)
  assert.deepEqual(s.map((d) => d.count), diasSeq(31, (i) => i * 2).map(([, c]) => c))
})

test('renderSVG: um ponto por dia, nenhum NaN', () => {
  const svg = renderSVG(buildSeries(calendario(diasSeq(31)), 31), { username: 'douglascshun' })
  assert.equal((svg.match(/<circle/g) || []).length, 31)
  assert.ok(!svg.includes('NaN'), 'SVG contém NaN')
  assert.ok(svg.startsWith('<svg'), 'não começa com <svg')
})

test('renderSVG: preserva as cores pedidas', () => {
  const svg = renderSVG(buildSeries(calendario(diasSeq(31)), 31), {
    username: 'x', bg: '#000000', color: '#1987F0', line: '#ffffff', point: '#ffffff',
  })
  for (const c of ['#000000', '#1987F0', '#ffffff']) assert.ok(svg.includes(c), `faltou ${c}`)
})

test('escala: valor 0 assenta na baseline e o máximo no topo do plot', () => {
  const s = buildSeries(calendario(diasSeq(31, (i) => (i === 0 ? 0 : i === 30 ? 100 : 5))), 31)
  const svg = renderSVG(s, { username: 'x' })
  const ys = [...svg.matchAll(/<circle[^>]*cy="([\d.]+)"/g)].map((m) => Number(m[1]))
  assert.equal(ys[0], PLOT.baseline, 'zero não caiu na baseline')
  assert.equal(ys.at(-1), PLOT.top, 'máximo não chegou ao topo do plot')
})

test('degenerado: série toda zerada não vira NaN nem estoura a escala', () => {
  const svg = renderSVG(buildSeries(calendario(diasSeq(31, () => 0)), 31), { username: 'x' })
  assert.ok(!svg.includes('NaN'), 'divisão por zero vazou NaN')
  const ys = [...svg.matchAll(/<circle[^>]*cy="([\d.]+)"/g)].map((m) => Number(m[1]))
  assert.ok(ys.every((y) => y === PLOT.baseline), 'série zerada deveria ficar toda na baseline')
})

test('escapa texto para não quebrar o XML', () => {
  const svg = renderSVG(buildSeries(calendario(diasSeq(31)), 31), { username: 'a<b>&"c' })
  assert.ok(!svg.includes('a<b>'), 'username não foi escapado')
  assert.ok(svg.includes('a&lt;b&gt;&amp;&quot;c'))
})

test('descarta os dias futuros da semana corrente', () => {
  // A GraphQL devolve semanas COMPLETAS: a semana atual vem até sábado, zerada.
  const dias = diasSeq(35, (i) => i + 1)
  const hoje = dias[31][0] // corta 3 dias no futuro
  const s = buildSeries(calendario(dias), 31, hoje)
  assert.equal(s.at(-1).date, hoje, 'deixou dia futuro entrar na série')
  assert.equal(s.at(-1).count, 32)
  assert.equal(s.length, 31)
})

test('hojeEm: o corte do dia segue Brasília, não UTC', () => {
  // 00:23 UTC de 11/09 ainda é 21:23 de 10/09 em Brasília. Sem isso, as rodadas
  // agendadas entre 21h e 00h BRT deixam entrar um dia que nem começou aqui —
  // e ele chega zerado, derrubando o fim do gráfico três horas por noite.
  assert.equal(hojeEm(new Date('2026-09-11T00:23:00Z')), '2026-09-10')
  assert.equal(hojeEm(new Date('2026-09-11T02:23:00Z')), '2026-09-10')
  // 03:23 UTC já é 00:23 do dia seguinte em Brasília: aí sim vira.
  assert.equal(hojeEm(new Date('2026-09-11T03:23:00Z')), '2026-09-11')
  // Meio da tarde: UTC e BRT concordam.
  assert.equal(hojeEm(new Date('2026-09-10T19:33:00Z')), '2026-09-10')
})

test('hojeEm: o dia virado em UTC não encurta a série nem zera o fim', () => {
  const dias = diasSeq(40, (i) => i + 1)
  const ate = hojeEm(new Date('2026-09-11T00:23:00Z'))
  // a API devolve a semana inteira, com o dia seguinte já presente e zerado
  const comFuturo = [...dias, ['2026-09-10', 7], ['2026-09-11', 0]]
  const s = buildSeries(calendario(comFuturo), 31, ate)
  assert.equal(s.at(-1).date, '2026-09-10', 'deixou o dia UTC-adiantado entrar')
  assert.equal(s.at(-1).count, 7, 'o fim do gráfico foi zerado pelo dia que não começou')
})
