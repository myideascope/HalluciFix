// Browser stub for chokidar module
import { EventEmitter } from './events.js';

class MockWatcher extends EventEmitter {
  constructor() {
    super();
  }

  add() {
    return this;
  }

  unwatch() {
    return this;
  }

  close() {
    return Promise.resolve();
  }
}

export const watch = () => new MockWatcher();

export default { watch };