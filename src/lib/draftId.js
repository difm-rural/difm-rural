// A fresh job id for a posting session, chosen on the device before the job is
// inserted. Posting with a known id makes a retry safe: if the first attempt
// reached the database but its response was lost, the second attempt hits the
// same id instead of creating a duplicate job. (The web form does the same.)
//
// A random v4 UUID. Math.random is fine here — the id is not a secret, it only
// has to be unique, and the database rejects a clash rather than overwriting.
export function newJobId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = Math.floor(Math.random() * 16)
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}
