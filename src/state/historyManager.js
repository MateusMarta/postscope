import { vizStore } from '../services/visualizationStore.js';
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
     * 1. Checks if a numeric ID is in the URL hash (restoring from history).
     * 2. If not, sets up a listener for `postMessage` from the bookmarklet/scraper.
     * @param {string} urlFragment The hash string (e.g., "#171542389123")
     */
    async getSession(urlFragment) {
        await this.dbReady;
        
        // Case 1: URL contains an ID (e.g. #171542389123)
        // Strip the '#' and check if it is purely numeric
        const possibleId = urlFragment ? urlFragment.substring(1) : null;
        
        if (possibleId && /^\d+$/.test(possibleId)) {
            const historyEntry = await vizStore.getVisualization(possibleId);
            
            if (historyEntry) {
                // Return data if we have it, regardless of whether analysis finished (savedState)
                // This enables "Resuming" incomplete sessions.
                return { 
                    data: historyEntry.allItems || null, 
                    context: historyEntry.context, 
                    savedState: historyEntry.savedState || null, 
                    historyEntry 
                };
            }
        }

        // Case 2: New Analysis (Data waiting via PostMessage or user needs to use bookmarklet)
        return { data: null, context: null, savedState: null, historyEntry: null, waitingForData: true };
    }

    /**
     * Returns a promise that resolves when the window receives a 'postscope-data' message.
     */
    waitForData() {
        return new Promise((resolve, reject) => {
            // Send a signal that we are ready
            if (window.opener) {
                window.opener.postMessage({ type: 'postscope-ready' }, '*');
            }

            const handler = (event) => {
                // Security check could be added here (origin check), but Postscope is client-side.
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
                                originalText: row.text || ''
                            }))
                            .filter(item => item.content);
                        
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
     * This creates a history entry before analysis starts, preventing data loss.
     */
    async createInitialHistoryEntry(context, allItems) {
        const id = Date.now();
        
        let name = 'Untitled Visualization';
        if (context) {
            const truncatedName = truncate(context.name, 40);
            if (truncatedName) { // Prioritize scraped name for Lists/Communities
                if (context.type === 'list') name = `List: ${truncatedName}`;
                else if (context.type === 'communities') name = `Community: ${truncatedName}`;
                else name = truncatedName;
            } else { // Fallback to type-based names
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
            savedState: null, // Analysis hasn't run yet
            allItems: allItems // Store raw data
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