// Shared by the review screen and the guest request resumed after sign-in.
export function bookingRequestCopy(isQuoteRequired) {
  return isQuoteRequired ? {
    action: 'Request a quote',
    nextStep: 'The provider will send a quote for you to review.',
    authTitle: 'Sign in to request a quote',
    authMessage: 'Sign in or create a free account to send your quote request.',
    successTitle: 'Quote request sent',
  } : {
    action: 'Send booking request',
    nextStep: 'The provider will review your request. Your booking is confirmed when they accept.',
    authTitle: 'Sign in to send your request',
    authMessage: 'Sign in or create a free account to send your booking request.',
    successTitle: 'Booking request sent',
  }
}
