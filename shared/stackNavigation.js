// A stack at its root cannot handle POP_TO_TOP. Avoid dispatching an action
// that would bubble to the tab navigator and produce an unhandled warning.
export function stackRootAction(state) {
  if (state?.type !== 'stack' || !state.key || !(state.index > 0)) return null
  return { type: 'POP_TO_TOP', target: state.key }
}
