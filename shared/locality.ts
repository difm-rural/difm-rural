// Coarse town/suburb from a geocoded/selected address, mirroring the SQL
// public.locality_from_address. Takes the comma-separated part before the
// country, strips postcodes/digits, and returns '' when nothing safe can be
// derived (empty, digits-only, or a street — a road-type final word). It never
// returns a street number or road name.
export function localityFromAddress(address: string | null | undefined): string {
  if (!address) return ''
  let parts = String(address).split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length && /^(new zealand|aotearoa|nz)$/i.test(parts[parts.length - 1])) parts = parts.slice(0, -1)
  if (!parts.length) return ''
  const town = parts[parts.length - 1].replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!town || !/\p{L}/u.test(town)) return ''
  if (/\b(road|rd|street|st|avenue|ave|lane|ln|drive|dr|highway|hwy|place|pl|crescent|cres|terrace|tce|close|court|ct|parade|grove|boulevard|blvd|quay|esplanade|motorway|way|row|mews)\s*$/i.test(town)) return ''
  return town
}
