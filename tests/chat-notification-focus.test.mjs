import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'
const require = createRequire(import.meta.url)
const { transformSync } = require('@babel/core')
const source = await readFile(new URL('../src/screens/ChatScreen.js', import.meta.url), 'utf8')
const compiled = transformSync(source, { babelrc: false, configFile: false,
  plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] }).code

test('blurred chats stop reading notifications; reopening loads and reads only that conversation', async () => {
  let focusEffect
  const reads = []
  const channels = []
  const removed = []
  const query = { select() { return query }, eq() { return query }, or() { return query },
    async order() { return { data: [], error: null } } }
  const client = {
    auth: { async getUser() { return { data: { user: { id: 'me' } }, error: null } } },
    from() { return query },
    channel() {
      const handlers = []
      const channel = { handlers, on(event, filter, callback) { handlers.push({ filter, callback }); return channel }, subscribe() { return channel } }
      channels.push(channel); return channel
    },
    removeChannel(channel) { removed.push(channel) },
  }
  const react = { createElement: () => null, useCallback: callback => callback,
    useRef: value => ({ current: value }), useState: value => [value, () => {}] }
  const mocks = {
    react,
    'react-native': { StyleSheet: { create: value => value }, Platform: { OS: 'ios' }, Alert: { alert() {} } },
    '@react-navigation/native': { useFocusEffect(callback) { focusEffect = callback } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'expo-image-picker': {}, '../lib/supabase': { supabase: client },
    '../theme/tokens': { colors: {} }, '../components/Icon': () => null,
    '../components/EnquiryPersonCard': () => null,
    '../lib/location': {}, '../lib/notifications': { async markNotificationsReadFor(params) { reads.push(params) } },
  }
  const module = { exports: {} }
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { console, setTimeout })(
    name => { if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`); return mocks[name] }, module, module.exports)
  module.exports.default({ route: { params: { serviceId: 'listing', otherUserId: 'person', jobTitle: 'Grazing' } }, navigation: {} })
  const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
  const blur = focusEffect()
  await settle()
  assert.equal(reads.length, 1)
  assert.equal(reads[0].senderId, 'person')
  const receive = channels[0].handlers[0].callback
  blur()
  assert.equal(removed.length, 1)
  receive({ new: { id: 'later', sender_id: 'person', receiver_id: 'me' } })
  assert.equal(reads.length, 1, 'off-screen messages stay unread')
  const closeAgain = focusEffect()
  await settle()
  assert.equal(reads.length, 2, 'returning to chat acknowledges visible messages')
  closeAgain()
})
