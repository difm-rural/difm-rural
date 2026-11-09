// Heuristics that flag campaign copy reading as shouting (mostly uppercase) or
// Title Case, so authors prefer sentence case. Warning only — never blocks saving.

// >60% of letters are uppercase (needs a few letters to judge).
export function isMostlyUppercase(text: string): boolean {
  const letters = (text.match(/[A-Za-z]/g) || []).length
  if (letters < 3) return false
  const upper = (text.match(/[A-Z]/g) || []).length
  return upper / letters > 0.6
}

// 3+ words and every word starts with a capital letter.
export function isTitleCase(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(w => /[A-Za-z]/.test(w))
  if (words.length < 3) return false
  return words.every(w => {
    const first = w.match(/[A-Za-z]/)
    return first ? first[0] === first[0].toUpperCase() : true
  })
}

export function needsSentenceCase(text: string): boolean {
  const t = (text || '').trim()
  if (!t) return false
  return isMostlyUppercase(t) || isTitleCase(t)
}

export const SENTENCE_CASE_HINT = "Use sentence case — e.g. 'Get your paddocks summer ready'"
