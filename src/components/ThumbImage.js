import React, { useState } from 'react'
import { Image } from 'react-native'
import { fallbackImageSrc, thumbUrl } from '../../shared/photos'

// A card / list photo: loads the small "_thumb" copy of an uploaded photo and,
// if that fails (photos uploaded before thumbnails existed have none), falls
// back to the full photo once — never loops. Detail screens and galleries use
// a plain <Image> with the full photo instead.
export default function ThumbImage({ uri, ...props }) {
  // Keyed by uri so a different photo starts again from its thumbnail.
  return <ThumbImageFor key={uri} uri={uri} {...props} />
}

function ThumbImageFor({ uri, onError, ...props }) {
  const [src, setSrc] = useState(() => thumbUrl(uri))
  if (!src) return null
  return (
    <Image
      {...props}
      source={{ uri: src }}
      onError={event => {
        const next = fallbackImageSrc(src, uri)
        if (next) setSrc(next)
        onError?.(event)
      }}
    />
  )
}
