import type { CodingQuestion } from './types.ts'
import type { CodeLang, CompiledCodeLang } from './languages.ts'

export type DataShape =
  | { kind: 'number'; decimal: boolean; wide: boolean }
  | { kind: 'boolean' }
  | { kind: 'string' }
  | { kind: 'array'; item: DataShape | null }
  | { kind: 'unknown' }

export interface CodingSignature {
  functionName: string
  paramNames: string[]
  params: DataShape[]
  result: DataShape
}

const unknown: DataShape = { kind: 'unknown' }
const integerShape: DataShape = { kind: 'number', decimal: false, wide: false }

function mergeShape(a: DataShape | null, b: DataShape | null): DataShape | null {
  if (!a || a.kind === 'unknown') return b
  if (!b || b.kind === 'unknown') return a
  if (a.kind === 'number' && b.kind === 'number') {
    return { kind: 'number', decimal: a.decimal || b.decimal, wide: a.wide || b.wide }
  }
  if (a.kind === 'array' && b.kind === 'array') return { kind: 'array', item: mergeShape(a.item, b.item) }
  return a.kind === b.kind ? a : unknown
}

function fromGenerator(spec: Record<string, any>): DataShape {
  const kind = String(spec.$gen || '')
  const array = (item: DataShape | null = null): DataShape => ({ kind: 'array', item })
  const get = (value: unknown): DataShape => shapeOf(value)
  switch (kind) {
    case 'ints': case 'distinct': case 'perm': case 'range': case 'countup':
      return array(integerShape)
    case 'str': case 'strrepeat':
      return { kind: 'string' }
    case 'strs':
      return array({ kind: 'string' })
    case 'choice': {
      let item: DataShape | null = null
      for (const value of spec.values || []) item = mergeShape(item, get(value))
      return array(item)
    }
    case 'grid': {
      const cell = Array.isArray(spec.values) && spec.values.length ? get(spec.values[0]) : integerShape
      return array(array(cell))
    }
    case 'affine': case 'intervals': case 'edges':
      return array(array(integerShape))
    case 'repeat':
      return array(get(spec.value))
    case 'concat': {
      let merged: DataShape | null = null
      for (const part of spec.parts || []) merged = mergeShape(merged, get(part))
      if (merged?.kind === 'array' || merged?.kind === 'string') return merged
      return array(merged)
    }
    case 'sorted': case 'shuffle':
      return get(spec.of)
    case 'chunks': {
      const child = get(spec.of)
      return array(child.kind === 'array' ? child : array(child))
    }
    case 'col': {
      const source = get(spec.of)
      return array(source.kind === 'array' ? source.item : null)
    }
    case 'zip': {
      const parts = (spec.parts || []).map(get)
      let item: DataShape | null = null
      for (const part of parts) item = mergeShape(item, part.kind === 'array' ? part.item : null)
      return array(array(item))
    }
    case 'patch':
      return get(spec.of)
    default:
      return unknown
  }
}

export function shapeOf(value: unknown): DataShape {
  if (value === null || value === undefined) return unknown
  if (typeof value === 'boolean') return { kind: 'boolean' }
  if (typeof value === 'number') {
    return { kind: 'number', decimal: !Number.isInteger(value), wide: !Number.isSafeInteger(value) || value > 2_147_483_647 || value < -2_147_483_648 }
  }
  if (typeof value === 'string') return { kind: 'string' }
  if (Array.isArray(value)) {
    let item: DataShape | null = null
    for (const entry of value) item = mergeShape(item, shapeOf(entry))
    return { kind: 'array', item }
  }
  if (typeof value === 'object') {
    const raw = value as Record<string, unknown>
    if (typeof raw.$gen === 'string') return fromGenerator(raw)
    return unknown
  }
  return unknown
}

export function inferCodingSignature(q: CodingQuestion, lang: CodeLang): CodingSignature {
  const parseNames = (source: string, functionName: string, language: 'python' | 'javascript') => {
    const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = language === 'python'
      ? new RegExp(`\\bdef\\s+${escaped}\\s*\\(([^)]*)\\)`)
      : new RegExp(`\\bfunction\\s+${escaped}\\s*\\(([^)]*)\\)`)
    const match = source.match(re)
    return match?.[1]
      ? match[1].split(',').map((part) => part.trim().replace(/^\.\.\./, '').split('=')[0].trim()).filter(Boolean)
      : []
  }

  const pyName = q.fn.python
  const jsName = q.fn.javascript
  const functionName = lang === 'javascript' || lang === 'cpp' || lang === 'java' || lang === 'go' ? jsName : pyName
  const pyNames = parseNames(q.starter?.python || '', pyName, 'python')
  const jsNames = parseNames(q.starter?.javascript || '', jsName, 'javascript')
  const names = pyNames.length ? pyNames : jsNames
  const arity = Math.max(0, ...q.tests.map((test) => Array.isArray(test.args) ? test.args.length : 0))

  const params = Array.from({ length: arity }, (_, index) => {
    let shape: DataShape | null = null
    for (const test of q.tests) shape = mergeShape(shape, shapeOf(Array.isArray(test.args) ? test.args[index] : undefined))
    return shape || unknown
  })
  let result: DataShape | null = null
  for (const test of q.tests) {
    const expected = test.expected
    if (expected && typeof expected === 'object' && !Array.isArray(expected) && '$digest' in (expected as object)) continue
    result = mergeShape(result, shapeOf(expected))
  }

  const reserved = new Set([
    'class', 'function', 'return', 'static', 'public', 'private', 'package', 'import', 'type', 'fn', 'match', 'loop', 'move', 'ref', 'self', 'Self',
    'async', 'await', 'var', 'const', 'func', 'range', 'map', 'select', 'case', 'default', 'switch', 'break', 'continue', 'if', 'else', 'for', 'while', 'do',
    'new', 'delete', 'throw', 'try', 'catch', 'struct', 'enum', 'impl', 'trait', 'where', 'use', 'mod', 'crate', 'super', 'in', 'as', 'let', 'mut', 'dyn',
    'interface', 'extends', 'implements', 'void', 'int', 'long', 'double', 'float', 'char', 'boolean', 'byte', 'short', 'this', 'null', 'true', 'false', 'static_cast',
  ])
  const usedNames = new Set<string>()
  const paramNames = params.map((_, index) => {
    let name = (names[index] || `arg${index + 1}`).replace(/[^A-Za-z0-9_]/g, '')
    if (!/^[A-Za-z_]/.test(name) || reserved.has(name) || usedNames.has(name)) name = `arg${index + 1}`
    usedNames.add(name)
    return name
  })

  return { functionName, paramNames, params, result: result || unknown }
}

function itemShape(shape: DataShape): DataShape {
  return shape.kind === 'array' ? (shape.item || integerShape) : shape
}

function cppType(shape: DataShape): string {
  if (shape.kind === 'array') return `std::vector<${cppType(itemShape(shape))}>`
  if (shape.kind === 'number') return shape.decimal ? 'double' : 'long long'
  if (shape.kind === 'boolean') return 'bool'
  if (shape.kind === 'string') return 'std::string'
  return 'long long'
}
function javaType(shape: DataShape): string {
  if (shape.kind === 'array') return `${javaType(itemShape(shape))}[]`
  // Use 64-bit integers consistently: a small example may hide a large valid
  // answer (subarray counts/products routinely exceed Java's 32-bit range).
  if (shape.kind === 'number') return shape.decimal ? 'double' : 'long'
  if (shape.kind === 'boolean') return 'boolean'
  if (shape.kind === 'string') return 'String'
  return 'long'
}
function rustType(shape: DataShape): string {
  if (shape.kind === 'array') return `Vec<${rustType(itemShape(shape))}>`
  if (shape.kind === 'number') return shape.decimal ? 'f64' : 'i64'
  if (shape.kind === 'boolean') return 'bool'
  if (shape.kind === 'string') return 'String'
  return 'i64'
}
function goType(shape: DataShape): string {
  if (shape.kind === 'array') return `[]${goType(itemShape(shape))}`
  if (shape.kind === 'number') return shape.decimal ? 'float64' : 'int64'
  if (shape.kind === 'boolean') return 'bool'
  if (shape.kind === 'string') return 'string'
  return 'int64'
}
function cType(shape: DataShape): string {
  if (shape.kind === 'array') {
    const child = itemShape(shape)
    if (child.kind === 'array') {
      const leaf = itemShape(child)
      return leaf.kind === 'string' ? 'StringMatrix' : leaf.kind === 'number' && leaf.decimal ? 'DoubleMatrix' : 'LongMatrix'
    }
    if (child.kind === 'string') return 'StringArray'
    if (child.kind === 'number' && child.decimal) return 'DoubleArray'
    return 'LongArray'
  }
  if (shape.kind === 'number') return shape.decimal ? 'double' : 'long long'
  if (shape.kind === 'boolean') return 'bool'
  if (shape.kind === 'string') return 'char *'
  return 'long long'
}

function javaEmptyArray(shape: DataShape): string {
  const type = javaType(shape)
  const dimensions = (type.match(/\[\]/g) || []).length
  const base = type.replace(/\[\]/g, '')
  return `new ${base}[0]${'[]'.repeat(Math.max(0, dimensions - 1))}`
}

function cFunctionBody(sig: CodingSignature): string {
  const params = sig.params.map((shape, i) => `${cType(shape)} ${sig.paramNames[i]}`).join(', ') || 'void'
  const resultType = cType(sig.result)
  const defaults: Record<string, string> = {
    LongArray: '{ NULL, 0 }', DoubleArray: '{ NULL, 0 }', StringArray: '{ NULL, 0 }',
    LongMatrix: '{ NULL, 0 }', DoubleMatrix: '{ NULL, 0 }', StringMatrix: '{ NULL, 0 }',
    'char *': '""', bool: 'false', double: '0.0', 'long long': '0',
  }
  if (resultType.endsWith('Array') || resultType.endsWith('Matrix')) {
    return `${resultType} ${sig.functionName}(${params}) {\n    ${resultType} result = ${defaults[resultType]};\n    /* Allocate result.data and set result.len before returning an array. */\n    return result;\n}`
  }
  return `${resultType} ${sig.functionName}(${params}) {\n    return ${defaults[resultType] || '0'};\n}`
}

export function starterFor(q: CodingQuestion, lang: CodeLang): string {
  if (lang === 'python') return q.starter.python
  if (lang === 'javascript') return q.starter.javascript
  const sig = inferCodingSignature(q, lang)
  if (lang === 'cpp') {
    const fallback = sig.result.kind === 'array' ? '{}' : sig.result.kind === 'string' ? '""' : sig.result.kind === 'boolean' ? 'false' : sig.result.kind === 'number' && sig.result.decimal ? '0.0' : '0'
    return `// Implement the function below. Inputs use std::vector, std::string and 64-bit integers.\n${cppType(sig.result)} ${sig.functionName}(${sig.params.map((shape, i) => `${cppType(shape)} ${sig.paramNames[i]}`).join(', ')}) {\n    // TODO: implement an efficient solution.\n    return ${fallback};\n}\n`
  }
  if (lang === 'java') {
    const fallback = sig.result.kind === 'array' ? javaEmptyArray(sig.result) : sig.result.kind === 'string' ? '""' : sig.result.kind === 'boolean' ? 'false' : sig.result.kind === 'number' && sig.result.decimal ? '0.0' : '0'
    return `// Implement this method in class Solution style; the judge supplies a Main harness.\npublic ${javaType(sig.result)} ${sig.functionName}(${sig.params.map((shape, i) => `${javaType(shape)} ${sig.paramNames[i]}`).join(', ')}) {\n    // TODO: implement an efficient solution.\n    return ${fallback};\n}\n`
  }
  if (lang === 'rust') {
    const fallback = sig.result.kind === 'array' ? 'Vec::new()' : sig.result.kind === 'string' ? 'String::new()' : sig.result.kind === 'boolean' ? 'false' : sig.result.kind === 'number' && sig.result.decimal ? '0.0' : '0'
    return `// Implement this function; the judge provides the JSON/test harness.\nfn ${sig.functionName}(${sig.params.map((shape, i) => `${sig.paramNames[i]}: ${rustType(shape)}`).join(', ')}) -> ${rustType(sig.result)} {\n    // TODO: implement an efficient solution.\n    ${fallback}\n}\n`
  }
  if (lang === 'go') {
    const fallback = sig.result.kind === 'array' ? `${goType(sig.result)}{}` : sig.result.kind === 'string' ? '""' : sig.result.kind === 'boolean' ? 'false' : sig.result.kind === 'number' && sig.result.decimal ? '0.0' : '0'
    return `// Implement this function. Common standard-library imports are already available.\nfunc ${sig.functionName}(${sig.params.map((shape, i) => `${sig.paramNames[i]} ${goType(shape)}`).join(', ')}) ${goType(sig.result)} {\n    // TODO: implement an efficient solution.\n    return ${fallback}\n}\n`
  }
  return `${cFunctionBody(sig)}\n`
}

export function nativeSignature(q: CodingQuestion, lang: CompiledCodeLang): CodingSignature {
  return inferCodingSignature(q, lang)
}

export const nativeShapeTypes = { cppType, javaType, rustType, goType, cType, itemShape }
