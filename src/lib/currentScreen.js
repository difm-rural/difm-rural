// The focused route name, kept outside React so the app-wide error boundary
// (which sits above the NavigationContainer) can say which screen crashed.
let current = null

export function setCurrentScreen(name) {
  current = name || null
}

export function currentScreen() {
  return current
}
