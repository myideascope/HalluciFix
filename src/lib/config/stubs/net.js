// Browser stub for net module
export class Socket {
  constructor() {
    console.warn('Net Socket is not available in browser environment');
  }
}

export function createConnection() {
  throw new Error('Net connections not available in browser environment');
}

export default { Socket, createConnection };