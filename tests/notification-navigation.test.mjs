import assert from 'node:assert/strict'
import test from 'node:test'
import { CommonActions, StackRouter } from '@react-navigation/routers'
import { stackRootAction } from '../shared/stackNavigation.js'

test('Done exits repeated notification/chat visits in one action', () => {
  const router = StackRouter({ initialRouteName: 'ActivityMain' })
  const options = { routeNames: ['ActivityMain', 'Notifications', 'Chat'], routeParamList: {}, routeGetIdList: {} }
  let state = router.getRehydratedState({ index: 4, routes: [
    { name: 'ActivityMain' }, { name: 'Notifications' }, { name: 'Chat' },
    { name: 'Notifications' }, { name: 'Chat' },
  ] }, options)
  state = router.getStateForAction(state, CommonActions.goBack(), options)
  assert.equal(state.routes[state.index].name, 'Notifications')
  state = router.getStateForAction(state, stackRootAction(state), options)
  assert.equal(state.routes.length, 1)
  assert.equal(state.routes[state.index].name, 'ActivityMain')
})

test('tab root reset removes history without adding a duplicate root', () => {
  const router = StackRouter({ initialRouteName: 'Dashboard' })
  const options = { routeNames: ['Dashboard', 'Notifications', 'Chat'], routeParamList: {}, routeGetIdList: {} }
  let state = router.getRehydratedState({ index: 2, routes: [
    { name: 'Dashboard' }, { name: 'Notifications' }, { name: 'Chat' },
  ] }, options)
  const rootKey = state.routes[0].key
  state = router.getStateForAction(state, stackRootAction(state), options)
  assert.equal(state.routes.length, 1)
  assert.equal(state.routes[0].key, rootKey)
  assert.equal(stackRootAction(state), null)
})

test('tab presses do not pop a root, uninitialised, or non-stack navigator', () => {
  assert.equal(stackRootAction(undefined), null)
  assert.equal(stackRootAction({ key: 'lazy-stack' }), null)
  assert.equal(stackRootAction({ type: 'stack', key: 'root', index: 0 }), null)
  assert.equal(stackRootAction({ type: 'tab', key: 'tabs', index: 2 }), null)
  assert.deepEqual(stackRootAction({ type: 'stack', key: 'messages', index: 2 }),
    { type: 'POP_TO_TOP', target: 'messages' })
})
