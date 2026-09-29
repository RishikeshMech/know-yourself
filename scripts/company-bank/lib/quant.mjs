/**
 * Generated quantitative-aptitude items.
 *
 * The Ques Section-1 document covers only six single-step formula templates
 * (percentages, profit/loss, simple interest, ratio, averages, distance). Its
 * own coverage note promises time & work, probability, permutations and more,
 * so those topics are generated here from parameter tables.
 *
 * Every answer is COMPUTED (exact rational arithmetic), never typed by hand, and
 * distractors model the classic mistakes (using simple instead of compound
 * interest, adding instead of combining rates, forgetting repeated letters…).
 * The build rejects any item whose four options are not distinct.
 */

/* ---------------------------- rational helpers --------------------------- */
const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b))
function frac(n, d) {
  if (d < 0) { n = -n; d = -d }
  const g = gcd(n, d) || 1
  return { n: n / g, d: d / g }
}
const fstr = (f) => (f.d === 1 ? String(f.n) : `${f.n}/${f.d}`)
const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1))
const nCr = (n, r) => (r < 0 || r > n ? 0 : fact(n) / (fact(r) * fact(n - r)))
const nPr = (n, r) => fact(n) / fact(n - r)
const money = (v) => (Number.isInteger(v) ? `₹${v}` : `₹${v.toFixed(2)}`)
const trim = (v) => (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2))))

/**
 * Format-preserving perturbations used to top up distractors when the
 * "classic mistake" candidates happen to coincide for a parameter set
 * (e.g. 5!/2! = 5!/2 for APPLE). Keeps prefix/suffix, fractions and ratios.
 */
function perturb(answer) {
  const out = []
  let m
  if ((m = answer.match(/^(\d+)\/(\d+)$/))) {
    const n = Number(m[1]), d = Number(m[2])
    for (const f of [frac(n + 1, d), frac(n, d + 1), frac(n * 2, d * 3), frac(Math.max(1, n - 1), d), frac(n, d * 2)]) {
      if (f.n > 0 && f.n < f.d) out.push(fstr(f))
    }
    return out
  }
  if ((m = answer.match(/^(\d+):(\d+)$/))) {
    const a = Number(m[1]), b = Number(m[2])
    return [`${b}:${a}`, `${a + 1}:${b}`, `${a}:${b + 1}`, `${a * 2}:${b + 1}`]
  }
  if ((m = answer.match(/^(\D*?)(-?\d+(?:\.\d+)?)(\D*)$/))) {
    const [, pre, numText, suf] = m
    const v = Number(numText)
    const decimals = numText.includes('.') ? numText.split('.')[1].length : 0
    const fmt = (x) => {
      const r = decimals ? Number(x.toFixed(decimals)) : Math.round(x)
      if (pre === '₹' && decimals) return `${pre}${r.toFixed(2)}${suf}`
      return `${pre}${r}${suf}`
    }
    for (const k of [1.25, 0.8, 1.5, 0.5, 2, 1.1, 0.9]) out.push(fmt(v * k))
    for (const d of [1, -1, 2, 5, 10]) out.push(fmt(v + d))
    return out.filter((o) => o !== answer && !/^\D*-/.test(o))
  }
  return out
}

function item(topic, template, difficulty, q, answer, distractors, explanation) {
  const pool = [...distractors, ...perturb(answer)]
  const options = [answer]
  for (const d of pool) {
    if (options.length === 4) break
    if (d && !options.includes(d)) options.push(d)
  }
  if (options.length !== 4) throw new Error(`Could not build 4 distinct options for: ${q}`)
  return { topic, area: 'quant', difficulty, group: `gen:${template}`, q, answer, options, explanation, template }
}

/* ------------------------------- templates ------------------------------- */

function timeAndWork() {
  const out = []
  for (const [a, b] of [[10, 15], [12, 24], [20, 30], [6, 12], [15, 30], [24, 40], [18, 36], [30, 60]]) {
    const t = (a * b) / (a + b)
    out.push(item('Time and Work', 'work-together', 'medium',
      `A can finish a piece of work in ${a} days and B can finish it in ${b} days. Working together, in how many days will they finish it?`,
      `${trim(t)} days`, [`${trim((a + b) / 2)} days`, `${a + b} days`, `${trim(Math.abs(b - a))} days`, `${trim(t + 2)} days`],
      `Combined rate = 1/${a} + 1/${b} = 1/${trim(t)} of the work per day.`))
  }
  for (const [x, y] of [[12, 20], [10, 15], [6, 10], [8, 12], [20, 30], [15, 24]]) {
    const t = (x * y) / (y - x)
    out.push(item('Time and Work', 'work-alone', 'hard',
      `A and B together can complete a task in ${x} days. A alone can complete it in ${y} days. How many days will B alone take?`,
      `${trim(t)} days`, [`${y - x} days`, `${trim((x * y) / (x + y))} days`, `${trim(t / 2)} days`, `${x + y} days`],
      `B's rate = 1/${x} − 1/${y} = 1/${trim(t)}.`))
  }
  return out
}

function compoundInterest() {
  const out = []
  for (const [p, r] of [[5000, 10], [8000, 5], [10000, 8], [12000, 10], [6250, 4], [15000, 6]]) {
    const amount = p * (1 + r / 100) ** 2
    const ci = Math.round((amount - p) * 100) / 100
    const si = (p * r * 2) / 100
    out.push(item('Compound Interest', 'ci-2y', 'medium',
      `Find the compound interest on ₹${p} at ${r}% per annum for 2 years, compounded annually.`,
      money(ci), [money(si), money(Math.round(amount * 100) / 100), money((p * r) / 100), money(ci + (p * r) / 100)],
      `A = ${p}(1 + ${r}/100)² = ${trim(amount)}; CI = A − P.`))
  }
  for (const [r, diff] of [[10, 50], [5, 15], [8, 64], [4, 24], [12, 72], [6, 36]]) {
    const p = Math.round(diff / (r / 100) ** 2)
    out.push(item('Compound Interest', 'ci-si-diff', 'hard',
      `The difference between the compound interest and the simple interest on a sum for 2 years at ${r}% per annum is ₹${diff}. Find the sum.`,
      `₹${p}`, [`₹${Math.round(diff / (r / 100))}`, `₹${Math.round(p / 2)}`, `₹${p * 2}`, `₹${Math.round(diff * r)}`],
      `CI − SI for 2 years = P(r/100)², so P = ${diff} ÷ (${r}/100)² = ${p}.`))
  }
  return out
}

function probability() {
  const out = []
  const ways = (s) => { let c = 0; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b === s) c++; return c }
  for (const s of [7, 8, 9, 10, 11, 4]) {
    const f = frac(ways(s), 36)
    const wrong = [frac(ways(s), 12), frac(ways(s) + 1, 36), frac(1, 11), frac(ways(s), 30)]
    out.push(item('Probability', 'dice-sum', 'medium',
      `Two fair six-sided dice are rolled. What is the probability that the sum of the numbers is ${s}?`,
      fstr(f), wrong.map(fstr), `There are ${ways(s)} favourable outcomes out of 36.`))
  }
  for (const [r, b] of [[4, 6], [5, 3], [3, 5], [6, 4], [2, 6], [7, 3]]) {
    const f = frac(nCr(r, 2), nCr(r + b, 2))
    const withRep = frac(r * r, (r + b) * (r + b))
    out.push(item('Probability', 'balls-both-red', 'hard',
      `A bag contains ${r} red and ${b} blue balls. Two balls are drawn at random without replacement. What is the probability that both are red?`,
      fstr(f), [fstr(withRep), fstr(frac(r, r + b)), fstr(frac(2 * r, (r + b) * 2 + 1)), fstr(frac(r - 1, r + b))],
      `C(${r},2) / C(${r + b},2) = ${nCr(r, 2)}/${nCr(r + b, 2)}.`))
  }
  return out
}

function permutations() {
  const out = []
  const words = ['LEVEL', 'APPLE', 'BANANA', 'SCHOOL', 'LETTER', 'ORANGE', 'MANGO']
  for (const w of words) {
    const counts = {}
    for (const c of w) counts[c] = (counts[c] || 0) + 1
    const denom = Object.values(counts).reduce((m, c) => m * fact(c), 1)
    const ans = fact(w.length) / denom
    out.push(item('Permutations and Combinations', 'word-arrangements', denom > 1 ? 'medium' : 'easy',
      `In how many distinct ways can the letters of the word '${w}' be arranged?`,
      String(ans), [String(fact(w.length)), String(fact(w.length) / 2), String(fact(w.length - 1)), String(ans * 2)],
      denom > 1 ? `${w.length}! divided by the factorials of the repeated-letter counts.` : `${w.length}! arrangements of distinct letters.`))
  }
  for (const [n, k] of [[8, 3], [10, 4], [7, 2], [9, 3], [12, 2], [6, 3]]) {
    out.push(item('Permutations and Combinations', 'committee', 'medium',
      `In how many ways can a committee of ${k} people be chosen from a group of ${n}?`,
      String(nCr(n, k)), [String(nPr(n, k)), String(nCr(n, k - 1)), String(n * k), String(nCr(n, k) + n)],
      `Order does not matter: C(${n},${k}).`))
  }
  for (const [m, w, s, k] of [[6, 4, 5, 2], [5, 4, 4, 2], [7, 3, 4, 1], [5, 5, 4, 2], [6, 5, 5, 3]]) {
    const ans = nCr(w, k) * nCr(m, s - k)
    out.push(item('Permutations and Combinations', 'committee-exact', 'hard',
      `A committee of ${s} is to be formed from ${m} men and ${w} women. In how many ways can this be done if it must contain exactly ${k} ${k === 1 ? 'woman' : 'women'}?`,
      String(ans), [String(nCr(m + w, s)), String(nCr(w, k) + nCr(m, s - k)), String(nPr(w, k) * nCr(m, s - k)), String(nCr(w, k) * nCr(m, s))],
      `C(${w},${k}) × C(${m},${s - k}).`))
  }
  return out
}

function mixtures() {
  const out = []
  for (const [a, b, m] of [[40, 60, 52], [30, 50, 36], [20, 35, 26], [24, 36, 28], [45, 70, 55], [60, 90, 70]]) {
    const f = frac(b - m, m - a)
    out.push(item('Mixtures and Alligation', 'alligation', 'medium',
      `In what ratio must rice costing ₹${a} per kg be mixed with rice costing ₹${b} per kg so that the mixture costs ₹${m} per kg?`,
      `${f.n}:${f.d}`, [`${f.d}:${f.n}`, `${a}:${b}`, `${frac(m - a, m).n}:${frac(m - a, m).d}`, `${f.n + 1}:${f.d}`],
      `By alligation, cheaper : dearer = (${b} − ${m}) : (${m} − ${a}).`))
  }
  for (const [v, p1, p2] of [[40, 25, 40], [60, 20, 40], [80, 25, 50], [30, 20, 25], [50, 10, 28]]) {
    const x = (v * (p2 - p1)) / (100 - p2)
    out.push(item('Mixtures and Alligation', 'add-water', 'hard',
      `A ${v}-litre mixture of milk and water contains ${p1}% water. How many litres of water must be added so that water becomes ${p2}% of the new mixture?`,
      `${trim(x)} litres`, [`${trim((v * (p2 - p1)) / 100)} litres`, `${trim(x * 2)} litres`, `${trim((v * p2) / 100)} litres`, `${trim(x + 5)} litres`],
      `Milk stays ${trim(v * (1 - p1 / 100))} L, so the new total is ${trim(v * (1 - p1 / 100))} ÷ ${(100 - p2) / 100}.`))
  }
  return out
}

function boats() {
  const out = []
  for (const [d1, t1, d2, t2] of [[30, 2, 18, 2], [40, 4, 24, 4], [36, 3, 24, 3], [28, 2, 16, 2], [60, 4, 36, 4]]) {
    const down = d1 / t1, up = d2 / t2
    out.push(item('Boats and Streams', 'still-water', 'medium',
      `A boat travels ${d1} km downstream in ${t1} hours and ${d2} km upstream in ${t2} hours. What is the speed of the boat in still water?`,
      `${trim((down + up) / 2)} km/h`, [`${trim((down - up) / 2)} km/h`, `${trim(down + up)} km/h`, `${trim(down)} km/h`, `${trim(up)} km/h`],
      `Still-water speed = (downstream + upstream) / 2 = (${trim(down)} + ${trim(up)}) / 2.`))
    out.push(item('Boats and Streams', 'stream-speed', 'medium',
      `A boat travels ${d1} km downstream in ${t1} hours and ${d2} km upstream in ${t2} hours. What is the speed of the stream?`,
      `${trim((down - up) / 2)} km/h`, [`${trim((down + up) / 2)} km/h`, `${trim(down - up)} km/h`, `${trim(up)} km/h`, `${trim((down - up) / 2 + 1)} km/h`],
      `Stream speed = (downstream − upstream) / 2.`))
  }
  return out
}

function pipes() {
  const out = []
  for (const [a, b] of [[4, 6], [3, 5], [6, 9], [5, 10], [8, 12], [2, 3]]) {
    const t = (a * b) / (b - a)
    out.push(item('Pipes and Cisterns', 'fill-empty', 'medium',
      `Pipe A can fill a tank in ${a} hours and pipe B can empty the full tank in ${b} hours. If both pipes are opened together on an empty tank, how long will it take to fill it?`,
      `${trim(t)} hours`, [`${trim((a * b) / (a + b))} hours`, `${b - a} hours`, `${a + b} hours`, `${trim(t + a)} hours`],
      `Net rate = 1/${a} − 1/${b} = 1/${trim(t)} of the tank per hour.`))
  }
  return out
}

function clocks() {
  const out = []
  for (const [h, m] of [[3, 15], [4, 20], [9, 30], [7, 20], [10, 10], [5, 40], [6, 15], [12, 30]]) {
    let angle = Math.abs(30 * (h % 12) - 5.5 * m)
    if (angle > 180) angle = 360 - angle
    const naive = Math.abs(30 * (h % 12) - 6 * m)
    out.push(item('Clocks', 'clock-angle', 'hard',
      `What is the smaller angle between the hour hand and the minute hand of a clock at ${h}:${String(m).padStart(2, '0')}?`,
      `${trim(angle)}°`, [`${trim(Math.min(naive, 360 - naive))}°`, `${trim(360 - angle)}°`, `${trim(angle + 30)}°`, `${trim(Math.abs(angle - 15))}°`],
      `Angle = |30H − 5.5M| = |${30 * (h % 12)} − ${5.5 * m}|, taking the smaller of the two arcs.`))
  }
  return out
}

function trains() {
  const out = []
  for (const [l, t] of [[150, 10], [200, 8], [120, 6], [250, 18], [360, 24]]) {
    out.push(item('Trains', 'train-pole', 'easy',
      `A train ${l} m long passes a pole in ${t} seconds. What is its speed in km/h?`,
      `${trim((l / t) * 3.6)} km/h`, [`${trim(l / t)} km/h`, `${trim((l / t) * 1.8)} km/h`, `${trim((l / t) * 5)} km/h`, `${trim((l / t) * 3.6 + 10)} km/h`],
      `${l}/${t} m/s × 18/5.`))
  }
  for (const [l, p, t] of [[150, 250, 20], [120, 180, 15], [200, 300, 25], [100, 350, 18], [180, 270, 30]]) {
    out.push(item('Trains', 'train-platform', 'medium',
      `A train ${l} m long crosses a platform ${p} m long in ${t} seconds. What is the speed of the train in km/h?`,
      `${trim(((l + p) / t) * 3.6)} km/h`, [`${trim((l / t) * 3.6)} km/h`, `${trim(((l + p) / t))} km/h`, `${trim((p / t) * 3.6)} km/h`, `${trim(((l + p) / t) * 3.6 + 18)} km/h`],
      `The train covers its own length plus the platform: ${l + p} m in ${t} s.`))
  }
  for (const [a, b, u, v] of [[120, 180, 50, 40], [100, 150, 60, 30], [200, 160, 72, 36], [140, 160, 45, 63]]) {
    const secs = (a + b) / ((u + v) * (5 / 18))
    out.push(item('Trains', 'trains-opposite', 'hard',
      `Two trains ${a} m and ${b} m long run on parallel tracks in opposite directions at ${u} km/h and ${v} km/h. How long do they take to cross each other completely?`,
      `${trim(secs)} seconds`, [`${trim((a + b) / (Math.abs(u - v) * (5 / 18)))} seconds`, `${trim((a + b) / (u + v))} seconds`, `${trim(secs * 2)} seconds`, `${trim(b / ((u + v) * (5 / 18)))} seconds`],
      `Relative speed ${u + v} km/h = ${trim((u + v) * 5 / 18)} m/s over ${a + b} m.`))
  }
  return out
}

function partnership() {
  const out = []
  for (const [x, y, m, profit] of [[30000, 40000, 6, 12600], [20000, 30000, 10, 9000], [50000, 40000, 6, 14000], [24000, 36000, 10, 18000]]) {
    const a = 12 * x, b = m * y
    const share = (profit * a) / (a + b)
    out.push(item('Partnership', 'profit-share', 'hard',
      `A invests ₹${x} for 12 months and B invests ₹${y} for ${m} months in a business. Out of a total profit of ₹${profit}, what is A's share?`,
      money(Math.round(share * 100) / 100), [money(Math.round(((profit * x) / (x + y)) * 100) / 100), money(Math.round((profit - share) * 100) / 100), money(profit / 2), money(Math.round(((profit * 12) / (12 + m)) * 100) / 100)],
      `Shares are proportional to capital × time: ${a} : ${b}.`))
  }
  return out
}

export function generateQuant() {
  return [
    ...timeAndWork(), ...compoundInterest(), ...probability(), ...permutations(),
    ...mixtures(), ...boats(), ...pipes(), ...clocks(), ...trains(), ...partnership(),
  ]
}
