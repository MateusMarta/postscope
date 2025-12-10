import { vizStore } from '../services/visualizationStore.js';
import { profilePicCache } from '../services/ProfilePicCache.js';
import Papa from 'papaparse';

// Helper function to truncate long strings
const truncate = (str, maxLength) => {
    if (!str || str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
};

export class HistoryManager {
    constructor() {
        this.dbReady = vizStore._getDB();
    }

    /**
     * Retrieves session data.
     */
    async getSession(urlFragment) {
        await this.dbReady;

        const possibleId = urlFragment ? urlFragment.substring(1) : null;

        if (possibleId && /^\d+$/.test(possibleId)) {
            const historyEntry = await vizStore.getVisualization(possibleId);

            if (historyEntry) {
                // Attempt to backfill cache if historical entry has data
                if (historyEntry.allItems) {
                    const historicalTimestamp = historyEntry.timestamp || Date.now();
                    historyEntry.allItems.forEach(item => {
                        if (item.author && item.profilePic) {
                            profilePicCache.update(item.author, item.profilePic, historicalTimestamp);
                        }
                    });
                }

                return {
                    data: historyEntry.allItems || null,
                    context: historyEntry.context,
                    savedState: historyEntry.savedState || null,
                    historyEntry
                };
            }
        }

        return { data: null, context: null, savedState: null, historyEntry: null, waitingForData: true };
    }

    /**
     * Returns a promise that resolves when the window receives a 'postscope-data' message.
     */
    waitForData() {
        return new Promise((resolve, reject) => {
            if (window.opener) {
                window.opener.postMessage({ type: 'postscope-ready' }, '*');
            }

            const handler = (event) => {
                if (event.data && event.data.type === 'postscope-data') {
                    window.removeEventListener('message', handler);

                    const { csvData, context } = event.data;
                    try {
                        const parsed = Papa.parse(csvData, { header: true, skipEmptyLines: true });
                        const data = parsed.data
                            .map(row => ({
                                author: row.author || 'unknown',
                                content: row.text || '',
                                likes: parseInt(row.likes || '0', 10),
                                timestamp: row.timestamp || null,
                                url: row.url || null,
                                profilePic: row.profilePic || null, // Capture profile picture URL
                                originalText: row.text || ''
                            }))
                            .filter(item => item.content);

                        // Cache profile pictures
                        const retrievalTimestamp = Date.now();
                        const uniqueAuthors = new Map();
                        data.forEach(item => {
                            if (item.author && item.profilePic) {
                                uniqueAuthors.set(item.author, item.profilePic);
                            }
                        });

                        // Fire and forget cache updates
                        uniqueAuthors.forEach((url, author) => {
                            profilePicCache.update(author, url, retrievalTimestamp);
                        });

                        resolve({ data, context });
                    } catch (e) {
                        reject(e);
                    }
                }
            };

            window.addEventListener('message', handler);

            // Timeout after 30 seconds if nothing arrives
            setTimeout(() => {
                window.removeEventListener('message', handler);
                resolve(null);
            }, 30000);
        });
    }

    /**
     * SAVES RAW DATA IMMEDIATELY.
     */
    async createInitialHistoryEntry(context, allItems) {
        const id = Date.now();

        let name = 'Untitled Visualization';
        if (context) {
            const truncatedName = truncate(context.name, 40);
            if (truncatedName) {
                if (context.type === 'list') name = `List: ${truncatedName}`;
                else if (context.type === 'communities') name = `Community: ${truncatedName}`;
                else name = truncatedName;
            } else {
                switch (context.type) {
                    case 'post': name = `Replies to @${truncate(context.author, 30)}`; break;
                    case 'profile': name = `Profile: @${truncate(context.author, 30)} (${context.subpage || 'tweets'})`; break;
                    case 'home': name = `Home Timeline`; break;
                    case 'explore': name = `Explore Timeline`; break;
                    case 'bookmarks': name = `Bookmarks`; break;
                    case 'list': name = `List Visualization`; break;
                    case 'communities': name = `Community Visualization`; break;
                    case 'profile_communities': name = `Communities for @${truncate(context.author, 30)}`; break;
                    case 'profile_communities_explore': name = `Explore Communities for @${truncate(context.author, 30)}`; break;
                    case 'search':
                        const filterMap = { live: 'Latest', user: 'People', image: 'Media' };
                        let filterName = 'Top';
                        if (context.filter) { filterName = filterMap[context.filter] || context.filter; }
                        const truncatedQuery = truncate(context.query, 40);
                        name = `Search: "${truncatedQuery}" (${filterName})`;
                        break;
                    default: name = 'Untitled Visualization';
                }
            }
        }

        const newEntry = {
            id: id,
            timestamp: Date.now(),
            name: name,
            context: context || { type: 'unknown' },
            postCount: allItems.length,
            savedState: null,
            allItems: allItems
        };

        await vizStore.saveVisualization(newEntry);
        console.log("Created initial history entry:", newEntry.id);
        return newEntry;
    }

    async updateState(id, stateToSave) {
        if (!id) return;
        const entry = await vizStore.getVisualization(id);
        if (entry) {
            entry.savedState = stateToSave;
            if (stateToSave.visualizationName) {
                entry.name = stateToSave.visualizationName;
            }
            await vizStore.saveVisualization(entry);
            console.log("Updated saved state for:", id);
        }
    }
}