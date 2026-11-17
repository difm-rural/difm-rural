export const MAX_PHOTO_BYTES = 1024 * 1024
export const MAX_PHOTO_SIDE = 1024

export function normalisePhotoDraft(raw: unknown, categories: readonly string[]) {
  if (!raw || typeof raw !== 'object') return null
  const {status,title,description,category,question}=raw as Record<string,unknown>
  if (!(status==='draft'||status==='needs_detail'||status==='unusable') ||
      typeof title!=='string'||typeof description!=='string'||typeof category!=='string'||typeof question!=='string') return null
  const clean=(value:string,limit:number)=>value.trim().slice(0,limit)
  if(status==='unusable')return {status,title:'',description:'',category:null,question:''}
  return {
    status,title:clean(title,160),description:clean(description,2000),
    category:categories.includes(category)?category:null,
    question:status==='needs_detail'?clean(question,180).split('?')[0].trim().replace(/\.*$/,'')+(question.trim()?'?':''):'',
  }
}

// Retain only structural JPEG segments. Every APP segment and JPEG comment is
// removed, including EXIF, XMP, ICC, JFIF thumbnails and vendor metadata.
export function sanitisePhoto(bytes: Uint8Array): Uint8Array {
  if (bytes.length > MAX_PHOTO_BYTES || bytes[0] !== 255 || bytes[1] !== 216) throw new Error('Invalid JPEG')
  const parts = [bytes.subarray(0, 2)]
  let pos = 2
  let dimensions = false
  let scanned = false
  while (pos < bytes.length) {
    if (bytes[pos] !== 255) break
    const start = pos
    while (bytes[pos] === 255) pos++
    const marker = bytes[pos++]
    if (marker === 217 && dimensions && scanned && pos === bytes.length) {
      parts.push(bytes.subarray(start, pos))
      const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
      let offset = 0
      for (const part of parts) { result.set(part, offset); offset += part.length }
      return result
    }
    const length = (bytes[pos] << 8) | bytes[pos + 1]
    const end = pos + length
    if (length < 2 || end > bytes.length) break
    if (marker >= 224 && marker <= 239 || marker === 254) { pos = end; continue }
    if (![192, 194, 196, 219, 221, 218].includes(marker)) break
    if (marker === 192 || marker === 194) {
      const height = (bytes[pos + 3] << 8) | bytes[pos + 4]
      const width = (bytes[pos + 5] << 8) | bytes[pos + 6]
      if (dimensions || length < 8 || !height || !width || Math.max(width, height) > MAX_PHOTO_SIDE) break
      dimensions = true
    }
    pos = end
    if (marker === 218) {
      if (!dimensions) break
      scanned = true
      while (pos < bytes.length) {
        if (bytes[pos] !== 255) { pos++; continue }
        const next = bytes[pos + 1]
        if (next === 0 || next >= 208 && next <= 215) { pos += 2; continue }
        break
      }
    }
    parts.push(bytes.subarray(start, pos))
  }
  throw new Error('Invalid JPEG')
}

export async function readBoundedBody(request: Request, maxBytes: number) {
  const reader = request.body?.getReader()
  if (!reader || Number(request.headers.get('content-length')) > maxBytes) throw new Error('Invalid photo size')
  const data = new Uint8Array(maxBytes)
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (length + value.length > data.length) throw new Error('Invalid photo size')
      data.set(value, length)
      length += value.length
    }
  } finally { await reader.cancel().catch(() => {}) }
  return data.subarray(0, length)
}

export async function readPhoto(request: Request) {
  return sanitisePhoto(await readBoundedBody(request, MAX_PHOTO_BYTES))
}
