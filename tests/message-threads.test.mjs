import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
globalThis.threadTestClient = {}
const source = (await readFile(new URL('../src/lib/messageThreads.js', import.meta.url), 'utf8'))
  .replace("import { supabase } from './supabase'", 'const supabase = globalThis.threadTestClient')
const { groupMessageThreads, messagePreview, fetchMessageThreads } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

const sent = { id: 'm1', service_id: 'listing1', sender_id: 'me', receiver_id: 'owner', content: 'Is it available?', created_at: '2026-10-13T01:00:00Z' }
test('a sent enquiry is retrievable before the recipient replies', () => {
  const rows = groupMessageThreads([sent], 'me')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].otherUserId, 'owner')
  assert.equal(rows[0].subjectId, 'listing1')
})
test('multiple enquirers about one listing remain separate conversations', () => {
  const second = { ...sent, id: 'm2', sender_id: 'another-person' }
  const reply = { ...sent, id: 'm3', sender_id: 'owner', receiver_id: 'me', created_at: '2026-10-13T02:00:00Z' }
  const rows = groupMessageThreads([sent, second, reply], 'owner')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].otherUserId, 'me')
  assert.equal(rows[0].message.id, 'm3')
})
test('job, booking and listing threads cannot collide or include unrelated participants', () => {
  const rows = groupMessageThreads([sent,
    { ...sent, service_id: null, job_id: 'listing1' },
    { ...sent, service_id: null, booking_id: 'listing1' },
    { ...sent, sender_id: 'stranger', receiver_id: 'someone-else' }], 'me')
  assert.equal(rows.length, 3)
  assert.equal(new Set(rows.map(row => row.key)).size, 3)
})
test('attachment previews do not expose raw JSON', () => {
  assert.equal(messagePreview('{"type":"photo","url":"image"}'), 'Photo')
  assert.equal(messagePreview('{"type":"location"}'), 'Shared location')
  assert.equal(messagePreview('Hello'), 'Hello')
})
test('inbox uses participant filters and privacy-safe job reads; sent messages open the right chat', async () => {
  const queries = []
  const tables = { messages: [sent, { ...sent, id: 'job-message', service_id: null, job_id: 'job1' }],
    service_booking_messages: [], jobs_public: [{ id: 'job1', title: 'Fencing' }],
    profiles_public: [{ id: 'owner', full_name: 'Sam' }], services: [{ id: 'listing1', title: 'Grazing' }] }
  Object.assign(globalThis.threadTestClient, {
    auth: { async getUser() { return { data: { user: { id: 'me' } }, error: null } } },
    from(table) {
      const query = { table }; queries.push(query)
      const chain = {
        select() { return chain }, or(value) { query.filter = value; return chain },
        order() { return chain }, range() { return chain }, in() { return chain },
        then(resolve) { return Promise.resolve({ data: tables[table] || [], error: null }).then(resolve) },
      }
      return chain
    },
  })
  const rows = await fetchMessageThreads()
  assert.deepEqual(rows[0].chatParams, { serviceId: 'listing1', otherUserId: 'owner', otherUserName: 'Sam', jobTitle: 'Grazing' })
  assert.equal(rows[0].preview, 'You: Is it available?')
  assert.ok(queries.filter(query => query.table.endsWith('messages')).every(query => query.filter === 'sender_id.eq.me,receiver_id.eq.me'))
  assert.ok(!queries.some(query => query.table === 'jobs'))
  assert.ok(queries.some(query => query.table === 'jobs_public'))
})
