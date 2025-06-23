import { openDB } from 'idb';

const DB_NAME = 'PostscopeDB';
const DB_VERSION = 1;
const STORE_NAME = 'visualizations';

class VisualizationStore {
    constructor() {
        this.dbPromise = null;
    }

    _getDB() {
        if (!this.dbPromise) {
            this.dbPromise = openDB(DB_NAME, DB_VERSION, {
                upgrade(db) {
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        const store = db.createObjectStore(STORE_NAME, { keyPath: 'urlFragment' });
                        store.createIndex('timestamp', 'timestamp');
                    }
                }
            });
        }
        return this.dbPromise;
    }

    async getVisualization(urlFragment) {
        const db = await this._getDB();
        return db.get(STORE_NAME, urlFragment);
    }
    
    async saveVisualization(visObject) {
        const db = await this._getDB();
        return db.put(STORE_NAME, visObject);
    }
    
    async getHistoryList() {
        const db = await this._getDB();
        const all = await db.getAllFromIndex(STORE_NAME, 'timestamp');
        const historyList = all.map(item => {
            const { savedState, ...meta } = item;
            meta.hasSavedState = !!savedState && Object.keys(savedState).length > 0 && savedState.data2D && savedState.data2D.length > 0;
            return meta;
        });
        return historyList.reverse(); // Sort by most recent
    }
    
    async deleteVisualization(urlFragment) {
        const db = await this._getDB();
        return db.delete(STORE_NAME, urlFragment);
    }

    async clearAll() {
        const db = await this._getDB();
        return db.clear(STORE_NAME);
    }
    
    async updateName(urlFragment, newName) {
        const db = await this._getDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const item = await tx.store.get(urlFragment);
        if (item) {
            item.name = newName;
            await tx.store.put(item);
        }
        await tx.done;
    }
    
    async importVisualizations(visArray) {
        const db = await this._getDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        
        const existingKeys = await tx.store.getAllKeys();
        const existingKeysSet = new Set(existingKeys);

        const itemsToAdd = visArray.filter(item => item.urlFragment && !existingKeysSet.has(item.urlFragment));
        
        if (itemsToAdd.length > 0) {
            await Promise.all(itemsToAdd.map(item => tx.store.add(item)));
        }

        await tx.done;
        return itemsToAdd.length;
    }

    async exportAllVisualizations() {
        const db = await this._getDB();
        return db.getAll(STORE_NAME);
    }
}

export const vizStore = new VisualizationStore();