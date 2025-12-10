import { openDB } from 'idb';

const DB_NAME = 'ProfilePicsDB';
const STORE_NAME = 'profile-pics';
const DB_VERSION = 1;

export class ProfilePicCache {
    constructor() {
        this.dbPromise = null;
    }

    _getDB() {
        if (!this.dbPromise) {
            this.dbPromise = openDB(DB_NAME, DB_VERSION, {
                upgrade(db) {
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME, { keyPath: 'username' });
                    }
                }
            });
        }
        return this.dbPromise;
    }

    async init() {
        await this._getDB();
    }

    /**
     * Updates the profile picture for a user if the new one is more recent.
     * @param {string} username - The user's handle/screen name.
     * @param {string} url - The URL of the profile picture.
     * @param {number} retrievalTimestamp - When this URL was scraped/retrieved.
     */
    async update(username, url, retrievalTimestamp) {
        if (!username || !url) return;

        const db = await this._getDB();
        const existing = await db.get(STORE_NAME, username);

        // If we already have a record retrieved LATER (or same time) than this one, ignore this one.
        // We want the most recent *retrieval*.
        if (existing && existing.timestamp >= retrievalTimestamp) {
            return;
        }

        // If the URL is the same, we just update the timestamp to the newer one (so we know it's still fresh)
        // without re-fetching the blob to save bandwidth.
        if (existing && existing.originalUrl === url) {
            await db.put(STORE_NAME, { ...existing, timestamp: retrievalTimestamp });
            return;
        }

        // Fetch the new image
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            const blob = await response.blob();

            await db.put(STORE_NAME, {
                username,
                blob,
                timestamp: retrievalTimestamp,
                originalUrl: url
            });
            console.log(`Updated profile pic for ${username}`);
        } catch (error) {
            console.warn(`Failed to fetch/cache profile pic for ${username}:`, error);
        }
    }

    async getBlobUrl(username) {
        if (!username) return null;
        const db = await this._getDB();
        const record = await db.get(STORE_NAME, username);
        if (record && record.blob) {
            return URL.createObjectURL(record.blob);
        }
        return null;
    }

    async get(username) {
        if (!username) return null;
        const db = await this._getDB();
        return db.get(STORE_NAME, username);
    }
}

export const profilePicCache = new ProfilePicCache();
