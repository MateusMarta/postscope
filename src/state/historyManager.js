export class HistoryManager {
    constructor(historyKey) {
        this.HISTORY_KEY = historyKey;
        this.MAX_HISTORY_ITEMS = 20;
    }

    /**
     * Retrieves all information needed to start or restore a session.
     * @param {string} urlFragment The unique identifier from the URL hash.
     * @returns {{data: object[], context: object, savedState: object, historyEntry: object}}
     */
    getSession(urlFragment) {
        const history = this._getHistory();
        const historyEntry = history.find(item => item.urlFragment === urlFragment);

        if (!historyEntry) {
            // This case handles a fresh load from the bookmarklet where the entry isn't in history yet.
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

    _getHistory() {
        try {
            return JSON.parse(localStorage.getItem(this.HISTORY_KEY)) || [];
        } catch (e) {
            console.error("Failed to parse history from localStorage", e);
            localStorage.removeItem(this.HISTORY_KEY);
            return [];
        }
    }

    _saveHistory(history) {
        localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
    }

    saveNewHistoryEntry(context, postCount, urlFragment) {
        if (!urlFragment) return;
        let history = this._getHistory();

        if (history.some(item => item.urlFragment === urlFragment)) {
            console.log("This visualization is already in the history. Not creating a new entry.");
            return;
        }

        let name = 'Untitled Visualization';
        if (context) {
            if (context.type === 'post') name = `Replies to @${context.author}`;
            else if (context.type === 'profile') name = `Profile of @${context.author}`;
            else if (context.type === 'home') name = `Home Timeline Visualization`;
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

        history.unshift(newEntry);
        history = history.slice(0, this.MAX_HISTORY_ITEMS);
        this._saveHistory(history);
        console.log("Saved new entry to history:", newEntry);
    }

    updateNameForSession(urlFragment, newName) {
        if (!urlFragment || !newName) return;
        let history = this._getHistory();
        const historyIndex = history.findIndex(item => item.urlFragment === urlFragment);

        if (historyIndex !== -1) {
            history[historyIndex].name = newName;
            this._saveHistory(history);
            console.log(`Updated name for session ${urlFragment} to "${newName}"`);
        }
    }

    saveStateForSession(urlFragment, stateToSave) {
        if (!urlFragment) return;
        let history = this._getHistory();
        const historyIndex = history.findIndex(item => item.urlFragment === urlFragment);

        if (historyIndex !== -1) {
            history[historyIndex].savedState = stateToSave;
            // Also update the name from the state, ensuring it's synced
            if (stateToSave.visualizationName) {
                history[historyIndex].name = stateToSave.visualizationName;
            }
            this._saveHistory(history);
            console.log("Saved current state to history for:", urlFragment);
        }
    }
}