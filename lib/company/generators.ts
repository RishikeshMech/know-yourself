/**
 * Expand the deterministic generator specs used by the hidden coding tests.
 * This mirrors JS_GENERATORS in codeRunner.ts so compiled-language wrappers
 * receive exactly the same inputs as Python and Node.
 */
function rng(seed: unknown) {
  let x = (Number(seed) >>> 0) || 0x9e3779b9
  return {
    next() {
      x ^= x << 13
      x >>>= 0
      x ^= x >>> 17
      x ^= x << 5
      x >>>= 0
      return x
    },
    int(lo: number, hi: number) {
      return lo + (this.next() % (hi - lo + 1))
    },
  }
}

function expand(value: any): any {
  if (Array.isArray(value)) return value.map(expand)
  if (!value || typeof value !== 'object') return value
  if (!('$gen' in value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expand(v)]))

  const type = String(value.$gen)
  const random = rng(value.seed === undefined ? 1 : value.seed)
  const n = Number(value.n || 0)
  switch (type) {
    case 'ints':
      return Array.from({ length: n }, () => random.int(Number(value.lo), Number(value.hi)))
    case 'distinct': {
      const seen = new Set<number>()
      const out: number[] = []
      let guard = 0
      while (out.length < n && guard < Math.max(100, n * 100)) {
        guard++
        const next = random.int(Number(value.lo), Number(value.hi))
        if (!seen.has(next)) { seen.add(next); out.push(next) }
      }
      return out
    }
    case 'perm': {
      const base = Number(value.base || 0)
      const out = Array.from({ length: n }, (_, i) => base + i)
      for (let i = out.length - 1; i > 0; i--) {
        const j = random.int(0, i)
        ;[out[i], out[j]] = [out[j], out[i]]
      }
      return out
    }
    case 'str': {
      const alphabet = String(value.alphabet)
      let out = ''
      for (let i = 0; i < n; i++) out += alphabet[random.int(0, alphabet.length - 1)]
      return out
    }
    case 'range': {
      const start = Number(value.start), stop = Number(value.stop), step = Number(value.step || 1)
      const out: number[] = []
      for (let x = start; step > 0 ? x < stop : x > stop; x += step) out.push(x)
      return out
    }
    case 'repeat':
      return Array.from({ length: n }, () => expand(value.value))
    case 'strrepeat':
      return String(value.value).repeat(n)
    case 'concat': {
      const parts = (value.parts || []).map(expand)
      if (parts.every((part: any) => typeof part === 'string')) return parts.join('')
      return parts.flatMap((part: any) => Array.isArray(part) ? part : [...part])
    }
    case 'sorted': {
      const out = expand(value.of).slice().sort((a: any, b: any) => a - b)
      return value.desc ? out.reverse() : out
    }
    case 'grid': {
      const values = value.values
      const out: any[][] = []
      for (let row = 0; row < Number(value.rows); row++) {
        const result: any[] = []
        for (let col = 0; col < Number(value.cols); col++) {
          result.push(Array.isArray(values)
            ? values[random.int(0, values.length - 1)]
            : random.int(Number(value.lo), Number(value.hi)))
        }
        out.push(result)
      }
      return out
    }
    case 'choice': {
      const values = value.values || []
      return Array.from({ length: n }, () => values[random.int(0, values.length - 1)])
    }
    case 'shuffle': {
      const out = expand(value.of).slice()
      for (let i = out.length - 1; i > 0; i--) {
        const j = random.int(0, i)
        ;[out[i], out[j]] = [out[j], out[i]]
      }
      return out
    }
    case 'countup': {
      const base = Number(value.base || 0)
      const out: number[] = []
      for (let i = 0; i < Number(value.k); i++) for (let count = 0; count <= i; count++) out.push(base + i)
      return out
    }
    case 'chunks': {
      const source = expand(value.of)
      const size = Math.max(1, Number(value.size))
      const out: any[][] = []
      for (let i = 0; i < source.length; i += size) {
        const chunk = source.slice(i, i + size)
        out.push(value.sort ? chunk.sort((a: any, b: any) => a - b) : chunk)
      }
      return out
    }
    case 'col':
      return expand(value.of).map((row: any[]) => row[Number(value.index)])
    case 'zip': {
      const parts = (value.parts || []).map(expand)
      const length = parts.length ? Math.min(...parts.map((part: any[]) => part.length)) : 0
      return Array.from({ length }, (_, i) => parts.map((part: any[]) => part[i]))
    }
    case 'patch': {
      const grid = expand(value.of)
      for (const [row, col, cell] of value.cells || []) grid[row][col] = cell
      return grid
    }
    case 'strs': {
      const alphabet = String(value.alphabet)
      const length = Number(value.len)
      const unique = !!value.unique
      const seen = new Set<string>()
      const out: string[] = []
      let guard = 0
      while (out.length < n && guard < n * 50) {
        guard++
        let word = ''
        for (let i = 0; i < length; i++) word += alphabet[random.int(0, alphabet.length - 1)]
        if (unique) {
          if (seen.has(word)) continue
          seen.add(word)
        }
        out.push(word)
      }
      return out
    }
    case 'affine': {
      const a = value.a === undefined ? 1 : Number(value.a)
      const b = value.b === undefined ? 1 : Number(value.b)
      const c = Number(value.c || 0)
      return Array.from({ length: Number(value.rows) }, (_, i) =>
        Array.from({ length: Number(value.cols) }, (_, j) => a * i + b * j + c))
    }
    case 'intervals': {
      const minLen = Number(value.minLen || 0)
      const maxLen = Number(value.maxLen)
      return Array.from({ length: n }, () => {
        const start = random.int(Number(value.lo), Number(value.hi))
        return [start, start + random.int(minLen, maxLen)]
      })
    }
    case 'edges': {
      const m = Number(value.m), base = Number(value.base || 0), directed = value.directed === undefined ? true : !!value.directed
      const weighted = 'wlo' in value
      const acyclic = !!value.acyclic
      const seen = new Set<number>()
      const out: number[][] = []
      const add = (rawU: number, rawV: number) => {
        let u = rawU, v = rawV
        if (acyclic && u > v) [u, v] = [v, u]
        const key = directed ? u * n + v : Math.min(u, v) * n + Math.max(u, v)
        if (u === v || seen.has(key)) return
        seen.add(key)
        const edge = [u + base, v + base]
        if (weighted) edge.push(random.int(Number(value.wlo), Number(value.whi)))
        out.push(edge)
      }
      if (value.connected === undefined || value.connected) {
        for (let v = 1; v < n; v++) add(random.int(0, v - 1), v)
      }
      let guard = 0
      while (out.length < m && guard < m * 20) {
        guard++
        add(random.int(0, n - 1), random.int(0, n - 1))
      }
      return out
    }
    default:
      throw new Error(`Unknown coding-test generator: ${type}`)
  }
}

export function expandTestArgs(args: unknown): unknown {
  return expand(args)
}
