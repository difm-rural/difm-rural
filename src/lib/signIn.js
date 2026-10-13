export const RESEND_COOLDOWN_MS = 60000

export function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function signInError(error, verifying = false) {
  if (['over_email_send_rate_limit', 'over_request_rate_limit'].includes(error?.code) || error?.status === 429)
    return 'Please wait a minute before trying again.'
  if (['email_address_invalid', 'validation_failed'].includes(error?.code))
    return 'Check your email address, then try again.'
  if (error?.code === 'otp_expired')
    return 'This code is incorrect or has expired. Check the latest email, or request a new code.'
  if (verifying && error?.status === 403)
    return 'This code could not be verified. Check the latest email, or request a new code.'
  return verifying
    ? 'We couldn’t verify your code. Check your connection and try again.'
    : 'We couldn’t send your code. Check your connection and email address, then try again.'
}

export function updateCodeDigits(code, index, value) {
  const digits = value.replace(/\D/g, '')
  // Full-code paste/autofill replaces all boxes, regardless of focused box.
  if (digits.length >= 6) return digits.slice(0, 6).split('')
  const next = [...code]
  if (!digits) { next[index] = ''; return next }
  for (let i = 0; i < digits.length && index + i < 6; i++) next[index + i] = digits[i]
  return next
}
