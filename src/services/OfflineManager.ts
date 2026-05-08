export interface SyncItem {
  id: string;
  type: 'hazard' | 'emergency';
  payload: any;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  timestamp: number;
}

const SYNC_QUEUE_KEY = 'offlinenav_sync_queue';

export class OfflineManager {
  private static queue: SyncItem[] = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');

  static enqueue(type: 'hazard' | 'emergency', payload: any) {
    const item: SyncItem = {
      id: Math.random().toString(36).substring(7),
      type,
      payload,
      status: 'pending',
      timestamp: Date.now()
    };
    this.queue.push(item);
    this.save();
    this.process();
    return item;
  }

  static getQueue() {
    return this.queue;
  }

  static async process() {
    if (!navigator.onLine) return;

    for (const item of this.queue) {
      if (item.status === 'pending' || item.status === 'failed') {
        item.status = 'syncing';
        this.save();
        
        try {
          const response = await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
          });

          if (response.ok) {
            item.status = 'synced';
          } else {
            item.status = 'failed';
          }
        } catch (e) {
          item.status = 'failed';
        }
        this.save();
      }
    }
  }

  private static save() {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(this.queue));
    window.dispatchEvent(new CustomEvent('offlinenav-sync-update'));
  }

  static clearSynced() {
    this.queue = this.queue.filter(i => i.status !== 'synced');
    this.save();
  }
}
