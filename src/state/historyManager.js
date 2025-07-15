import { vizStore } from '../services/visualizationStore.js';

// Helper function to truncate long strings
const truncate = (str, maxLength) => {
    if (!str || str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
};

export class HistoryManager {
    constructor() {
        // This class no longer manages state directly.
    }

    /**
     * Retrieves all information needed to start or restore a session.
     * @param {string} urlFragment The unique identifier from the URL hash.
     * @returns {Promise<{data: object[], context: object, savedState: object, historyEntry: object}>}
     */
    async getSession(urlFragment) {
        await vizStore._getDB(); // Ensure DB is ready
        const historyEntry = await vizStore.getVisualization(urlFragment);

        if (!historyEntry) {
            // This case handles a fresh load from the bookmarklet where the entry isn't in the DB yet.
            const { data, context } = this._parseUrlFragment(urlFragment);
            return { data, context, savedState: null, historyEntry: null };
        }

        // For subsequent loads, the context is stored in the history entry itself.
        const context = historyEntry.context;
        const savedState = historyEntry.savedState || null;
        
        // Data is only needed for the very first analysis. Saved states contain their own `allItems`.
        const data = savedState ? null : this._parseUrlFragment(urlFragment).data;

        return { data, context, savedState, historyEntry };
    }

    _parseUrlFragment(urlFragment) {
        const hash = urlFragment.substring(1);
        const parts = hash.split('&');
        let base64Data = null;
        let base64Context = null;

        for (const part of parts) {
            if (part.startsWith('data=')) {
                base64Data = part.substring('data='.length);
            } else if (part.startsWith('context=')) {
                base64Context = part.substring('context='.length);
            }
        }

        let data = null;
        let context = null;

        if (base64Data) {
            try {
                const csvString = decodeURIComponent(escape(atob(base64Data)));
                const parsed = Papa.parse(csvString, { header: true, skipEmptyLines: true });
                data = parsed.data
                    .map(row => ({ 
                        author: row.author || 'unknown', 
                        content: row.text || '', 
                        likes: parseInt(row.likes || '0', 10),
                        timestamp: row.timestamp || null,
                        url: row.url || null,
                        originalText: row.text || ''
                    }))
                    .filter(item => item.content);
            } catch (e) {
                console.error("Failed to decode data from URL hash:", e);
            }
        }

        if (base64Context) {
            try {
                const contextString = decodeURIComponent(escape(atob(base64Context)));
                context = JSON.parse(contextString);
            } catch(e) {
                console.error("Failed to decode context from URL hash:", e);
            }
        }
        return { data, context };
    }

    async saveNewHistoryEntry(context, postCount, urlFragment) {
        if (!urlFragment) return;
        await vizStore._getDB();

        const existing = await vizStore.getVisualization(urlFragment);
        if (existing) {
            console.log("This visualization is already in the history. Not creating a new entry.");
            return null;
        }

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
                        let filterName = 'Top'; // Default to 'Top' if no filter is specified
                        if (context.filter) {
                            filterName = filterMap[context.filter] || context.filter;
                        }
                        const truncatedQuery = truncate(context.query, 40);
                        name = `Search: "${truncatedQuery}" (${filterName})`;
                        break;
                    default: name = 'Untitled Visualization';
                }
            }
        }

        const newEntry = {
            id: Date.now(),
            timestamp: Date.now(),
            name: name,
            context: context || { type: 'unknown' },
            postCount: postCount,
            urlFragment: urlFragment,
            savedState: null
        };

        await vizStore.saveVisualization(newEntry);
        console.log("Saved new entry to history DB:", newEntry);
        return newEntry;
    }

    async updateNameForSession(urlFragment, newName) {
        if (!urlFragment || !newName) return;
        await vizStore.updateName(urlFragment, newName);
        console.log(`Updated name for session ${urlFragment} to "${newName}"`);
    }

    async saveStateForSession(urlFragment, stateToSave) {
        if (!urlFragment) return;
        
        const entry = await vizStore.getVisualization(urlFragment);
        if (entry) {
            entry.savedState = stateToSave;
            if (stateToSave.visualizationName) {
                entry.name = stateToSave.visualizationName;
            }
            await vizStore.saveVisualization(entry);
            console.log("Saved current state to history DB for:", urlFragment);
        } else {
            console.warn("Could not find history entry to save state for:", urlFragment);
        }
    }
}