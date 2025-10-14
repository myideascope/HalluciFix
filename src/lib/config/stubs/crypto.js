// Browser stub for crypto module
export const randomBytes = (size) => {
  const array = new Uint8Array(size);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(array);
  }
  return array;
};

export const createHash = (algorithm) => ({
  update: () => ({ digest: () => 'mock-hash' })
});

export const createCipher = (algorithm, password) => ({
  update: (data) => data,
  final: () => ''
});

export const createDecipher = (algorithm, password) => ({
  update: (data) => data,
  final: () => ''
});

export default {
  randomBytes,
  createHash,
  createCipher,
  createDecipher
};