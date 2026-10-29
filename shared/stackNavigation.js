// A stack at its root cannot handle POP_TO_TOP. Avoid dispatching an action
// that would bubble to the tab navigator and produce an unhandled warning.
export function stackRootAction(state) {
  if (state?.type !== 'stack' || !state.key || !(state.index > 0)) return null
  return { type: 'POP_TO_TOP', target: state.key }
}

// A nested destination can become the first route when a lazy tab is opened.
// Tab buttons must return to their named landing screen, even in that case.
export function tabRootAction(state, rootName) {
  if (state?.type !== 'stack' || !state.key) return null
  if (state.routes?.[0]?.name !== rootName) {
    const root = state.routes?.find(route => route.name === rootName)
    return { type: 'RESET', target: state.key, payload: {
      index: 0, routes: [root || { name: rootName }],
    } }
  }
  return stackRootAction(state)
}
