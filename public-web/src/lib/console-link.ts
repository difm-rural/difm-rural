const CONSOLE_ORIGIN='https://dev.ruralconnections.nz'
export function consoleLink(destination='/'){
  const safe=destination.startsWith('/')&&!destination.startsWith('//')&&!/[\\\u0000-\u001f]/.test(destination)?destination:'/'
  return CONSOLE_ORIGIN+'/login?next='+encodeURIComponent(safe)
}
