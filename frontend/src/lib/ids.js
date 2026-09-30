/**
 * Random unique id. `crypto.randomUUID` only exists in secure contexts
 * (https or localhost), so opening the dev server from a phone over the LAN
 * would break without the getRandomValues fallback.
 * @param {Crypto} [cryptoImpl] injectable for tests
 * @returns {string}
 */
export function randomId(cryptoImpl = globalThis.crypto) {
  if (typeof cryptoImpl.randomUUID === 'function') return cryptoImpl.randomUUID()
  const bytes = cryptoImpl.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
