import type { Filter } from "nostr-tools";

class Mutex {
  queue: Promise<unknown>;

  constructor() {
    this.queue = Promise.resolve();
  }

  lock() {
    let unlockNext: (value: unknown) => unknown;

    const willLock = new Promise(resolve => unlockNext = resolve);
    const willUnlock = this.queue.then(() => unlockNext);
    
    this.queue = willLock;
    
    return willUnlock;
  }
}

const mutex = new Mutex();

export async function safeInsert<K, V>(map: Map<K, V>, key: K, value: V) {
  const unlock = await mutex.lock();
  
  try {
    // Traverse or insert into the map safely
    map.set(key, value);
  } finally {
    unlock(undefined);
  }
}

export async function safeTraverse<K, V>(map: Map<K, V>, callback: () => void) {
  const unlock = await mutex.lock();
  
  try {
    // Traverse the map safely
    callback();
  } finally {
    unlock(undefined);
  }
}

export function getSubscriptionMaps() {
  return {
    toSocket: new Map<string, WebSocket>(),
    toFilter: new Map<string, Filter>()
  };
}
