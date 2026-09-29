/** Languages supported by the company-assessment coding judge. */
export const CODE_LANGUAGES = [
  { id: 'python', label: 'Python 3', shortLabel: 'Python', extension: 'py', mode: 'interpreted' },
  { id: 'javascript', label: 'JavaScript (Node.js)', shortLabel: 'JS', extension: 'js', mode: 'interpreted' },
  { id: 'java', label: 'Java', shortLabel: 'Java', extension: 'java', mode: 'compiled' },
  { id: 'c', label: 'C (C11)', shortLabel: 'C', extension: 'c', mode: 'compiled' },
  { id: 'cpp', label: 'C++ (C++17)', shortLabel: 'C++', extension: 'cpp', mode: 'compiled' },
  { id: 'rust', label: 'Rust', shortLabel: 'Rust', extension: 'rs', mode: 'compiled' },
  { id: 'go', label: 'Go', shortLabel: 'Go', extension: 'go', mode: 'compiled' },
] as const

export type CodeLang = (typeof CODE_LANGUAGES)[number]['id']
export type CompiledCodeLang = Exclude<CodeLang, 'python' | 'javascript'>

export const SUPPORTED_LANGS: readonly CodeLang[] = CODE_LANGUAGES.map((language) => language.id)

export function isCodeLang(value: unknown): value is CodeLang {
  return typeof value === 'string' && SUPPORTED_LANGS.includes(value as CodeLang)
}

export function codeLanguageLabel(lang: CodeLang): string {
  return CODE_LANGUAGES.find((language) => language.id === lang)?.label || lang
}
