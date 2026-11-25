import test from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml, emailHtml, transactionalEmail } from '../shared/emailHtml.js'

const sample = '<b>Waitoki</b> & "quotes" 😀'

test('escapeHtml encodes markup once and keeps the emoji', () => {
  assert.equal(escapeHtml(sample), '&lt;b&gt;Waitoki&lt;/b&gt; &amp; &quot;quotes&quot; 😀')
  assert.equal(escapeHtml('Nelson & Tasman'), 'Nelson &amp; Tasman')
  assert.equal(escapeHtml('&amp;'), '&amp;amp;')
})

test('transactional email never forwards raw caller HTML', () => {
  const fromHtml = transactionalEmail({ html: `<p>${sample}</p><script>alert(1)</script>` })
  assert.equal(fromHtml.text, `<p>${sample}</p><script>alert(1)</script>`)
  assert.match(fromHtml.html, /&lt;b&gt;Waitoki&lt;\/b&gt; &amp; &quot;quotes&quot; 😀/)
  assert.doesNotMatch(fromHtml.html, /<script>|<b>Waitoki/)
  const fromText = transactionalEmail({ text: sample, html: '<img src=x onerror=alert(1)>' })
  assert.equal(fromText.text, sample)
  assert.match(fromText.html, /&lt;b&gt;Waitoki&lt;\/b&gt;/)
  assert.doesNotMatch(fromText.html, /onerror|src=x/)
  assert.match(emailHtml("Arthur's Pass"), /Arthur&#039;s Pass/)
})
