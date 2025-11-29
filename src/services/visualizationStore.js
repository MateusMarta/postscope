import { openDB } from 'idb';

const DB_NAME = 'PostscopeDB';
// Incremented version to trigger schema migration from urlFragment to ID
const DB_VERSION = 2; 
const STORE_NAME = 'visualizations';

class VisualizationStore {
    constructor() {
        this.dbPromise = null;
    }

    _getDB() {
        if (!this.dbPromise) {
            this.dbPromise = openDB(DB_NAME, DB_VERSION, {
                upgrade(db, oldVersion) {
                    // Migration: If old store exists with the bad schema (keyPath: urlFragment), delete it.
                    // This causes data loss for old versions, but is necessary to fix the architectural flaw.
                    if (oldVersion < 2 && db.objectStoreNames.contains(STORE_NAME)) {
                        db.deleteObjectStore(STORE_NAME);
                    }
                    
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        // FIX: Use 'id' (timestamp/number) as keyPath.
                        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                        store.createIndex('timestamp', 'timestamp');
                    }
                }
            });
        }
        return this.dbPromise;
    }

    async getVisualization(id) {
        if (!id) return null;
        const db = await this._getDB();
        // Ensure ID is a number, as URL params are strings
        const numericId = Number(id);
        if (isNaN(numericId)) return null;
        return db.get(STORE_NAME, numericId);
    }
    
    async saveVisualization(visObject) {
        const db = await this._getDB();
        return db.put(STORE_NAME, visObject);
    }
    
    async getHistoryList() {
        const db = await this._getDB();
        const all = await db.getAllFromIndex(STORE_NAME, 'timestamp');
        const historyList = all.map(item => {
            // Exclude heavy data blobs from the list view for performance
            const { savedState, allItems, ...meta } = item;
            meta.hasSavedState = !!savedState && Object.keys(savedState).length > 0;
            return meta;
        });
        return historyList.reverse(); // Sort by most recent
    }
    
    async deleteVisualization(id) {
        const db = await this._getDB();
        const numericId = Number(id);
        return db.delete(STORE_NAME, numericId);
    }

    async clearAll() {
        const db = await this._getDB();
        return db.clear(STORE_NAME);
    }
    
    async updateName(id, newName) {
        const db = await this._getDB();
        const numericId = Number(id);
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const item = await tx.store.get(numericId);
        if (item) {
            item.name = newName;
            if (item.savedState) {
                item.savedState.visualizationName = newName;
            }
            await tx.store.put(item);
        }
        await tx.done;
    }
    
    async importVisualizations(visArray) {
        const db = await this._getDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        let count = 0;

        for (const item of visArray) {
            // Basic validation
            if (item.id && item.context) {
                const exists = await tx.store.get(item.id);
                if (!exists) {
                    await tx.store.add(item);
                    count++;
                }
            }
        }

        await tx.done;
        return count;
    }

    async exportAllVisualizations() {
        const db = await this._getDB();
        return db.getAll(STORE_NAME);
    }
}

export const vizStore = new VisualizationStore();