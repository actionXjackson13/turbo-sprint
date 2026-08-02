import qrcode from 'qrcode-generator'

/**
 * QR encoding for the join link.
 *
 * Uses a library rather than a hand-rolled encoder on purpose: QR is a
 * spec-heavy format (Reed-Solomon over GF(256), mask selection, format info)
 * where a subtle mistake produces a code that looks perfectly plausible and
 * simply fails to scan — a defect you would discover in front of a room full
 * of people. `qrcode-generator` has no dependencies of its own.
 *
 * Error correction level M (~15% recoverable) is the right trade here: a phone
 * screen held up in a dark room picks up smudges and glare, and the payload is
 * short enough that the extra redundancy costs no meaningful density.
 */

/** A square matrix of modules; true means dark. */
export type QrMatrix = boolean[][]

export function encodeQr(text: string): QrMatrix {
  // Type 0 lets the library choose the smallest version that fits.
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()

  const count = qr.getModuleCount()
  const matrix: QrMatrix = []
  for (let row = 0; row < count; row++) {
    const line: boolean[] = []
    for (let col = 0; col < count; col++) line.push(qr.isDark(row, col))
    matrix.push(line)
  }
  return matrix
}

/**
 * Renders a matrix as an SVG path string.
 *
 * One path of many small rects beats one element per module: a version-5 code
 * is over a thousand modules, and a thousand DOM nodes on a screen the DJ
 * leaves open is a waste.
 */
export function matrixToSvgPath(matrix: QrMatrix): string {
  const parts: string[] = []
  matrix.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x} ${y}h1v1h-1z`)
    })
  })
  return parts.join('')
}
