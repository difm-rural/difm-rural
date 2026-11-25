import assert from 'node:assert/strict'
import {execFileSync, spawn} from 'node:child_process'
import {once} from 'node:events'
import {setTimeout as delay} from 'node:timers/promises'

// Uses the disposable loopback database populated by listing-availability.test.sql.
const [port = '56536', psql = 'psql', database = 'postgres'] = process.argv.slice(2)
assert.match(port, /^\d+$/)
const args = ['-X', '-qAt', '-w', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', database]
const query = sql => execFileSync(psql, [...args, '-c', sql], {encoding: 'utf8', timeout: 5000}).trim()
const listing = '10000000-0000-4000-8000-000000000001'
const requester = '00000000-0000-4000-8000-000000000002'
const provider = '00000000-0000-4000-8000-000000000001'
assert.equal(query(`select title from services where id='${listing}'`), 'Availability test listing')

function connection(name) {
  const child = spawn(psql, args, {env: {...process.env, PGAPPNAME: name}})
  let output = ''
  child.stdout.on('data', data => {output += data})
  child.stderr.on('data', data => {output += data})
  const exited = once(child, 'close')
  return {
    send: sql => child.stdin.write(sql + '\n'),
    output: () => output,
    async close() {child.stdin.end(); await exited},
  }
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return
    await delay(50)
  }
  assert.fail('Expected PostgreSQL connection state was not reached')
}
const pauseSql = `update services set availability_status='paused' where id='${listing}';`
const insertSql = id => `insert into bookings values('${id}','${listing}','${requester}','${provider}','pending');`
const bookingId = '20000000-0000-4000-8000-000000000003'
const blockedId = '20000000-0000-4000-8000-000000000004'
const pause = connection('listing-availability-pause')
const booking = connection('listing-availability-booking')
const blocked = name => query(`select count(*) from pg_stat_activity where application_name='listing-availability-${name}' and wait_event_type='Lock'`) === '1'

try {
  pause.send(`begin; ${pauseSql} select 'pause-lock-held';`)
  await waitFor(() => pause.output().includes('pause-lock-held'))
  booking.send(insertSql(blockedId))
  await waitFor(() => blocked('booking'))
  pause.send('commit;')
  await waitFor(() => booking.output().includes('This listing is temporarily paused for new requests.'))
  assert.equal(query(`select count(*) from bookings where id='${blockedId}'`), '0')

  query(`update services set availability_status='accepting_bookings' where id='${listing}'`)
  booking.send(`begin; ${insertSql(bookingId)} select 'booking-lock-held';`)
  await waitFor(() => booking.output().includes('booking-lock-held'))
  pause.send(pauseSql)
  await waitFor(() => blocked('pause'))
  booking.send('commit;')
  await waitFor(() => query(`select availability_status from services where id='${listing}'`) === 'paused')
  assert.equal(query(`select count(*) from bookings where id='${bookingId}'`), '1')
  console.log('PASS both lock orders for concurrent booking insertion and availability pause')
} finally {
  await Promise.all([pause.close(), booking.close()])
  query(`delete from bookings where id in ('${bookingId}','${blockedId}'); update services set availability_status='accepting_bookings' where id='${listing}'`)
}
