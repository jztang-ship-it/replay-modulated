import { describe, it, expect } from 'vitest'
import { extractCommentary, extractTone } from '../llmRouter.js'

// ── extractCommentary ────────────────────────────────────────────────────────

describe('extractCommentary', () => {
  it('parses clean JSON', () => {
    const input = '{"commentary":"Curry went off","tone":"hype"}'
    expect(extractCommentary(input)).toBe('Curry went off')
  })

  it('parses fenced JSON', () => {
    const input = '```json\n{"commentary":"LeBron quiet night","tone":"deadpan"}\n```'
    expect(extractCommentary(input)).toBe('LeBron quiet night')
  })

  it('parses JSON with trailing reasoning (ignores reasoning)', () => {
    const input = '```json\n{"commentary":"Good game","tone":"wry"}\n```\nWait—I need to reconsider. Let me rewrite...'
    expect(extractCommentary(input)).toBe('Good game')
  })

  it('rejects meta-commentary inside string (META_MARKERS)', () => {
    const input = '{"commentary":"Let me check the rules. Book is not on this roster.","tone":"deadpan"}'
    expect(extractCommentary(input)).toBeNull()
  })

  it('rejects backticks inside commentary string', () => {
    const input = '{"commentary":"The ```json block leaked","tone":"wry"}'
    expect(extractCommentary(input)).toBeNull()
  })

  it('returns clean text when no JSON present', () => {
    const input = 'Curry went nuclear tonight'
    expect(extractCommentary(input)).toBe('Curry went nuclear tonight')
  })

  it('rejects non-JSON text that contains debug markers', () => {
    const input = '"commentary": some broken output'
    expect(extractCommentary(input)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractCommentary('')).toBeNull()
  })

  it('returns null for truncated JSON (no closing brace)', () => {
    const input = '{"commentary":"Cut off mid-'
    expect(extractCommentary(input)).toBeNull()
  })

  it('returns first balanced JSON object when model self-revised', () => {
    const input = '{"commentary":"first try","tone":"wry"}\n{"commentary":"better version","tone":"hype"}'
    expect(extractCommentary(input)).toBe('first try')
  })
})

// ── extractTone ──────────────────────────────────────────────────────────────

describe('extractTone', () => {
  it('extracts valid tone from JSON', () => {
    const input = '{"commentary":"x","tone":"deadpan"}'
    expect(extractTone(input)).toBe('deadpan')
  })

  it('returns default for invalid tone value', () => {
    const input = '{"commentary":"x","tone":"neutral-to-warm"}'
    expect(extractTone(input)).toBe('observational')
  })

  it('returns default for plain text (no JSON)', () => {
    expect(extractTone('plain text')).toBe('observational')
  })

  it('returns default when tone field is missing', () => {
    const input = '{"commentary":"x"}'
    expect(extractTone(input)).toBe('observational')
  })
})
