import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const source = await readFile(new URL('../src/lib/signIn.js', import.meta.url), 'utf8')
const { validEmail, signInError, updateCodeDigits } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('email validation accepts complete addresses and rejects common mistakes', () => {
  for (const value of ['name@example.com', ' person+test@example.co.nz ']) assert.equal(validEmail(value), true)
  for (const value of ['', 'name', 'name@', '@example.com', 'name@example', 'name @example.com', 'a@@example.com'])
    assert.equal(validEmail(value), false)
})

test('full-code paste or autofill works from any box, including spaced clipboard text', () => {
  for (let index = 0; index < 6; index++) {
    assert.equal(updateCodeDigits(['9', '', '', '', '', ''], index, '123 456').join(''), '123456')
  }
})

test('partial paste, deletion and non-digit input cannot submit an invalid code', () => {
  const empty = ['', '', '', '', '', '']
  assert.deepEqual(updateCodeDigits(empty, 2, '34'), ['', '', '3', '4', '', ''])
  assert.deepEqual(updateCodeDigits(['1', '2', '3', '4', '5', '6'], 2, ''), ['1', '2', '', '4', '5', '6'])
  assert.deepEqual(updateCodeDigits(empty, 0, 'abc'), empty)
})

test('expired codes, send failures and rate limits offer actionable human wording', () => {
  assert.match(signInError({ code: 'otp_expired' }, true), /latest email.*new code/)
  assert.match(signInError({ status: 429 }), /wait a minute/)
  assert.match(signInError({ code: 'over_email_send_rate_limit' }), /wait a minute/)
  assert.match(signInError(new Error('internal server details')), /connection and email address/)
  assert.match(signInError(new Error('network error'), true), /connection and try again/)
})
