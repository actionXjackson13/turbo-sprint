import { useMemo } from 'react'
import clsx from 'clsx'
import { encodeQr, matrixToSvgPath } from '../utils/qr'

export interface QrCodeProps {
  /** The text to encode — for this app, a join URL. */
  value: string
  /** Accessible description; the code itself is meaningless to a screen reader. */
  label: string
  className?: string
}

/**
 * A scannable QR rendered as inline SVG.
 *
 * Drawn on a solid white plate with a quiet zone regardless of the dark theme:
 * scanners need the contrast, and an inverted or edge-to-edge code is a
 * classic reason a phone refuses to read one.
 */
export function QrCode({ value, label, className }: QrCodeProps) {
  const { path, size } = useMemo(() => {
    const matrix = encodeQr(value)
    return { path: matrixToSvgPath(matrix), size: matrix.length }
  }, [value])

  // Four modules of white on every side, as the spec requires.
  const quiet = 4
  const extent = size + quiet * 2

  return (
    <svg
      viewBox={`0 0 ${extent} ${extent}`}
      role="img"
      aria-label={label}
      className={clsx('h-auto w-full', className)}
      shapeRendering="crispEdges"
    >
      <rect width={extent} height={extent} fill="#ffffff" rx={1} />
      <g transform={`translate(${quiet} ${quiet})`} fill="#000000">
        <path d={path} />
      </g>
    </svg>
  )
}
