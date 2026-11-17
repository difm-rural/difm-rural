'use client'
/* eslint-disable @next/next/no-img-element -- Member photos from storage. */
import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react'
import { fallbackImageSrc, thumbUrl } from '@shared/photos'

// A card / list photo: loads the small "_thumb" copy of an uploaded photo and,
// if that fails (photos uploaded before thumbnails existed have none), falls
// back to the full photo once — never loops. Detail pages and galleries use a
// plain <img> with the full photo instead.
export function ThumbImg({ src, ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string }) {
  // Keyed by src so a different photo starts again from its thumbnail.
  return <ThumbImgFor key={src} src={src} {...props} />
}

function ThumbImgFor({ src, onError, ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string }) {
  const [current, setCurrent] = useState(() => thumbUrl(src))
  const ref = useRef<HTMLImageElement>(null)
  // A server-rendered image can fail before React hydrates and attaches
  // onError, so that error is never seen: check once after mount.
  useEffect(() => {
    const img = ref.current
    if (img?.complete && img.naturalWidth === 0) {
      const next = fallbackImageSrc(img.getAttribute('src') ?? '', src)
      if (next) setCurrent(next)
    }
  }, [src])
  return <img {...props} ref={ref} src={current} onError={event => {
    const next = fallbackImageSrc(current, src)
    if (next) setCurrent(next)
    onError?.(event)
  }} />
}
