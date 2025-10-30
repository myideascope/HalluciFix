// Browser stub for tls module
export class TLSSocket {
  constructor() {
    console.warn('TLS Socket is not available in browser environment');
  }
}

export function connect() {
  throw new Error('TLS connections not available in browser environment');
}

export default { TLSSocket, connect };