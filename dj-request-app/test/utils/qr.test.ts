import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'
import { encodeQr, matrixToSvgPath } from '../../src/utils/qr'
import { buildJoinUrl, readCodeFromSearch } from '../../src/utils/joinLink'

/**
 * A QR code that is subtly wrong still looks like a QR code. Asserting on the
 * matrix shape would happily pass a code no phone can read, so these tests
 * decode the output with an independent scanner and check the text comes back
 * — the same thing a guest's camera does.
 */

/** Rasterises a matrix to RGBA pixels, with the quiet zone a scanner expects. */
function rasterise(matrix: boolean[][], scale = 4, quietZone = 4) {
  const modules = matrix.length
  const size = (modules + quietZone * 2) * scale
  const data = new Uint8ClampedArray(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const moduleX = Math.floor(x / scale) - quietZone
      const moduleY = Math.floor(y / scale) - quietZone
      const dark =
        moduleY >= 0 &&
        moduleY < modules &&
        moduleX >= 0 &&
        moduleX < modules &&
        matrix[moduleY]![moduleX]!

      const value = dark ? 0 : 255
      const i = (y * size + x) * 4
      data[i] = value
      data[i + 1] = value
      data[i + 2] = value
      data[i + 3] = 255
    }
  }
  return { data, size }
}

const decode = (text: string): string | null => {
  const { data, size } = rasterise(encodeQr(text))
  return jsQR(data, size, size)?.data ?? null
}

describe('encodeQr', () => {
  it('produces a square matrix', () => {
    const matrix = encodeQr('https://example.com/#/join?code=PLAY')
    expect(matrix.length).toBeGreaterThan(0)
    for (const row of matrix) expect(row.length).toBe(matrix.length)
  })

  it('round-trips a join URL through a real decoder', () => {
    const url = buildJoinUrl('PLAY', 'https://actionxjackson13.github.io/turbo-sprint/dj')
    expect(decode(url)).toBe(url)
  })

  it('round-trips a localhost URL', () => {
    const url = buildJoinUrl('WXYZ', 'http://localhost:5173')
    expect(decode(url)).toBe(url)
  })

  it('round-trips every character the code alphabet can produce', () => {
    // Codes avoid look-alike characters, but the encoder should cope with any
    // of the ones that remain.
    for (const code of ['ACDE', 'FGHJ', 'KLMN', 'PQRT', 'UVWX', 'Y346', '79AC']) {
      const url = buildJoinUrl(code, 'https://example.com/app')
      expect(decode(url), `code ${code}`).toBe(url)
    }
  })

  it('survives a long host, which needs a denser version', () => {
    const url = buildJoinUrl(
      'PLAY',
      'https://a-really-quite-long-subdomain.example-events-company.co.uk/soundboard',
    )
    expect(decode(url)).toBe(url)
  })
})

describe('matrixToSvgPath', () => {
  it('emits one rect per dark module', () => {
    const matrix = [
      [true, false],
      [false, true],
    ]
    const path = matrixToSvgPath(matrix)
    expect(path).toBe('M0 0h1v1h-1zM1 1h1v1h-1z')
  })

  it('is empty for an all-light matrix', () => {
    expect(matrixToSvgPath([[false, false]])).toBe('')
  })
})

describe('buildJoinUrl / readCodeFromSearch', () => {
  it('puts the code in the hash route so the router receives it', () => {
    const url = buildJoinUrl('PLAY', 'https://example.com/app')
    expect(url).toBe('https://example.com/app/#/join?code=PLAY')
  })

  it('reads the code back, uppercased', () => {
    expect(readCodeFromSearch('?code=play')).toBe('PLAY')
  })

  it('returns null when no code is present', () => {
    expect(readCodeFromSearch('')).toBeNull()
    expect(readCodeFromSearch('?other=1')).toBeNull()
  })

  it('round-trips through the URL', () => {
    const url = buildJoinUrl('QRTV', 'https://example.com')
    const search = url.slice(url.indexOf('?'))
    expect(readCodeFromSearch(search)).toBe('QRTV')
  })
})
