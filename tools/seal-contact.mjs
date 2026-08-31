/* Seal a contact address so it is not present in the page source at all.
   The AES-GCM key is derived from the answer to the question shown on the
   contact section; a wrong answer fails the authentication tag and yields
   nothing, so there is no check to bypass.

   Usage:  node tools/seal-contact.mjs 'you@example.com' '1420'
   Then paste the output into CONTACT.sealed in js/config.js, and update
   CONTACT.question / CONTACT.hint to match the answer you chose. */
const enc = new TextEncoder();
const b64 = (buf) => Buffer.from(buf).toString('base64');

const [, , EMAIL, ANSWER] = process.argv;
if (!EMAIL || !ANSWER) {
  console.error("usage: node tools/seal-contact.mjs '<address>' '<answer>'");
  process.exit(1);
}
const ITER = 310000;

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9åäö]/g, '');
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));

const base = await crypto.subtle.importKey('raw', enc.encode(norm(ANSWER)), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
  base, { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
);
const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(EMAIL));
console.log(JSON.stringify({ salt: b64(salt), iv: b64(iv), ct: b64(ct), iterations: ITER }, null, 2));
