export class AppState {
    constructor() {
        this.visualizationName = "Untitled Visualization";
        this.allItems = [];
        this.embeddings = [];
        this.data10D = [];
        this.data2D = [];
        this.arePointLabelsVisible = true;

        this.currentLabels = [];
        this.currentMinClusterSize = 5;
        
        // Date range state
        this.globalMinDate = 0;
        this.globalMaxDate = 0;
        this.currentStartDate = 0;
        this.currentEndDate = 0;

        // Caches all data related to a specific clustering run
        this.clusteringDataByMinSize = new Map();

        // Stores customizations across different cluster size settings
        this.allSettingsCustomizations = new Map();
        
        // For the *current* clustering, maps a label to a persistent customization ID
        this.labelToCustIdMap = new Map();
        
        this.nextCustomizationId = 0;

        // Map of author handle -> { url, timestamp }
        this.authorProfilePics = new Map();
    }

    // --- GETTERS ---
    getVisualizationName = () => this.visualizationName;
    getAllItems = () => this.allItems;
    getData2D = () => this.data2D;
    getData10D = () => this.data10D;
    getEmbeddings = () => this.embeddings;
    getLabels = () => this.currentLabels;
    getMinClusterSize = () => this.currentMinClusterSize;
    getArePointLabelsVisible = () => this.arePointLabelsVisible;
    getCustomizationsForCurrentSize = () => this.allSettingsCustomizations.get(this.currentMinClusterSize) || new Map();
    getLabelToCustIdMap = () => this.labelToCustIdMap;
    getUniqueClusterCount = () => new Set(this.currentLabels.filter(l => l !== -1)).size;
    getAuthorProfilePics = () => this.authorProfilePics;
    hasClusteringForSize = (size) => this.clusteringDataByMinSize.has(size);
    
    getTimeRange = () => ({
        globalMin: this.globalMinDate,
        globalMax: this.globalMaxDate,
        currentStart: this.currentStartDate,
        currentEnd: this.currentEndDate
    });

    // --- SETTERS & STATE MODIFIERS ---
    setVisualizationName = (name) => { this.visualizationName = name; };
    setArePointLabelsVisible = (isVisible) => { this.arePointLabelsVisible = isVisible; };

    setTimeRange(start, end) {
        this.currentStartDate = start;
        this.currentEndDate = end;
    }

    setInitialData(allItems, embeddings, data10D, data2D) {
        this.allItems = allItems.map((item, i) => ({ ...item, embedding: embeddings[i] }));
        this.embeddings = embeddings;
        this.data10D = data10D;
        this.data2D = data2D;

        this._recalculateProfilePics();

        // Calculate global date range
        let minTime = Infinity;
        let maxTime = -Infinity;
        let hasTime = false;

        this.allItems.forEach(item => {
            if (item.timestamp) {
                const t = new Date(item.timestamp).getTime();
                if (!isNaN(t)) {
                    if (t < minTime) minTime = t;
                    if (t > maxTime) maxTime = t;
                    hasTime = true;
                }
            }
        });

        if (hasTime) {
            this.globalMinDate = minTime;
            this.globalMaxDate = maxTime;
            this.currentStartDate = minTime;
            this.currentEndDate = maxTime;
        } else {
            this.globalMinDate = 0;
            this.globalMaxDate = 100;
            this.currentStartDate = 0;
            this.currentEndDate = 100;
        }
    }

    _recalculateProfilePics() {
        this.authorProfilePics.clear();
        this.allItems.forEach(item => {
            if (item.profilePic && item.author) {
                const current = this.authorProfilePics.get(item.author);
                // Use item timestamp if available, otherwise consider it 'now' or strict comparison depends on data
                // If item has no timestamp, we treat it as old, or just overwrite if missing
                const itemTime = item.timestamp ? new Date(item.timestamp).getTime() : 0;
                
                if (!current || itemTime >= current.timestamp) {
                    this.authorProfilePics.set(item.author, { url: item.profilePic, timestamp: itemTime });
                }
            }
        });
    }

    /**
     * Calculates histogram bins for the timeline.
     * @param {number} binCount Number of bars in the histogram
     * @returns {number[]} Array of counts per bin
     */
    getHistogramData(binCount = 60) {
        if (!this.allItems.length || this.globalMaxDate <= this.globalMinDate) {
            return new Array(binCount).fill(0);
        }

        const range = this.globalMaxDate - this.globalMinDate;
        const bins = new Array(binCount).fill(0);

        this.allItems.forEach(item => {
            if (!item.timestamp) return;
            const t = new Date(item.timestamp).getTime();
            if (isNaN(t)) return;

            // Calculate bin index
            let i = Math.floor(((t - this.globalMinDate) / range) * binCount);
            
            // Clamp to last bin if exactly on max date
            i = Math.min(i, binCount - 1);
            i = Math.max(i, 0); // Safety check
            
            bins[i]++;
        });

        return bins;
    }

    /**
     * Returns subsets of items, coords, and labels that fall within the selected time range.
     * Maintains parallel array structure.
     */
    getFilteredData() {
        if (!this.allItems.length) {
            return { items: [], coords: [], labels: [] };
        }

        // If range covers everything, return everything (optimization)
        if (this.currentStartDate <= this.globalMinDate && this.currentEndDate >= this.globalMaxDate) {
            return {
                items: this.allItems,
                coords: this.data2D,
                labels: this.currentLabels
            };
        }

        const items = [];
        const coords = [];
        const labels = [];

        this.allItems.forEach((item, i) => {
            let itemTime = 0;
            if (item.timestamp) {
                itemTime = new Date(item.timestamp).getTime();
            }
            
            const isValidTime = !isNaN(itemTime) && itemTime > 0;
            
            if (isValidTime) {
                if (itemTime >= this.currentStartDate && itemTime <= this.currentEndDate) {
                    items.push(item);
                    coords.push(this.data2D[i]);
                    labels.push(this.currentLabels[i]);
                }
            } else {
                // Keep items without timestamps
                items.push(item);
                coords.push(this.data2D[i]);
                labels.push(this.currentLabels[i]);
            }
        });

        return { items, coords, labels };
    }

    switchToExistingClustering(minSize) {
        if (!this.clusteringDataByMinSize.has(minSize)) {
            console.error("Attempted to switch to a non-existent clustering size:", minSize);
            return;
        }
        const { labels, labelToCustIdMap } = this.clusteringDataByMinSize.get(minSize);
        this.currentMinClusterSize = minSize;
        this.currentLabels = labels;
        this.labelToCustIdMap = labelToCustIdMap;
    }

    updateClusteringResults(newLabels, newMinSize) {
        const oldCustomizations = this.allSettingsCustomizations.get(this.currentMinClusterSize) || new Map();
        
        const { newCustomizations, newLabelToCustId } = this._matchAndCarryOverCustomizations(newLabels, oldCustomizations);
        
        this.allSettingsCustomizations.set(newMinSize, newCustomizations);
        this.labelToCustIdMap = newLabelToCustId;
        this.currentLabels = newLabels;
        this.currentMinClusterSize = newMinSize;

        this.clusteringDataByMinSize.set(newMinSize, {
            labels: newLabels,
            labelToCustIdMap: newLabelToCustId
        });
    }

    _matchAndCarryOverCustomizations(newLabels, sourceCustomizations) {
        const newClusters = new Map();
        newLabels.forEach((label, index) => {
            if (label === -1) return;
            if (!newClusters.has(label)) newClusters.set(label, new Set());
            newClusters.get(label).add(index);
        });

        const newCustomizations = new Map();
        const newLabelToCustId = new Map();

        if (sourceCustomizations.size === 0 || newClusters.size === 0) {
             return { newCustomizations, newLabelToCustId };
        }
        
        const potentialMatches = [];
        for (const [newLabel, newMembers] of newClusters.entries()) {
            for (const [oldCustId, oldCustData] of sourceCustomizations.entries()) {
                if (!oldCustData.memberIndices) continue;
                const intersection = new Set([...newMembers].filter(x => oldCustData.memberIndices.has(x)));
                const union = new Set([...newMembers, ...oldCustData.memberIndices]);
                const similarity = union.size > 0 ? intersection.size / union.size : 0;
                if (similarity > 0.5) {
                    potentialMatches.push({ newLabel, oldCustId, similarity });
                }
            }
        }
        potentialMatches.sort((a, b) => b.similarity - a.similarity);

        const claimedOldCustIds = new Set();
        const assignedNewLabels = new Set();

        for (const match of potentialMatches) {
            if (!claimedOldCustIds.has(match.oldCustId) && !assignedNewLabels.has(match.newLabel)) {
                const newMembers = newClusters.get(match.newLabel);
                const oldData = sourceCustomizations.get(match.oldCustId);
                newCustomizations.set(match.oldCustId, { ...oldData, memberIndices: newMembers });
                newLabelToCustId.set(match.newLabel, match.oldCustId);
                claimedOldCustIds.add(match.oldCustId);
                assignedNewLabels.add(match.newLabel);
            }
        }
        return { newCustomizations, newLabelToCustId };
    }

    _ensureCustomizationExists(label) {
        let customizations = this.getCustomizationsForCurrentSize();
        if (!this.allSettingsCustomizations.has(this.currentMinClusterSize)) {
            this.allSettingsCustomizations.set(this.currentMinClusterSize, customizations);
        }
        
        let custId = this.labelToCustIdMap.get(label);
        if (custId === undefined) {
            custId = this.nextCustomizationId++;
            this.labelToCustIdMap.set(label, custId);
            const memberIndices = new Set(this.currentLabels.map((l, i) => l === label ? i : -1).filter(i => i !== -1));
            const uniqueLabels = [...new Set(this.currentLabels)].filter(l => l !== -1).sort((a,b)=>a-b);
            const defaultName = `Cluster ${uniqueLabels.indexOf(label) + 1}`;
            customizations.set(custId, { name: defaultName, visible: false, memberIndices });
        }
        return custId;
    }
    
    setClusterName(label, newName) {
        const custId = this._ensureCustomizationExists(label);
        const customization = this.getCustomizationsForCurrentSize().get(custId);
        if (customization) customization.name = newName;
    }

    setClusterVisibility(label, isVisible) {
        const custId = this._ensureCustomizationExists(label);
        const customization = this.getCustomizationsForCurrentSize().get(custId);
        if (customization) customization.visible = isVisible;
    }

    // --- PERSISTENCE ---
    getSerializableState() {
        const serializableCustomizations = Array.from(this.allSettingsCustomizations.entries()).map(([size, custMap]) => [
            size,
            Array.from(custMap.entries()).map(([id, custData]) => [id, {...custData, memberIndices: Array.from(custData.memberIndices)}])
        ]);

        const serializableClusteringData = Array.from(this.clusteringDataByMinSize.entries()).map(([size, data]) => [
            size,
            { labels: data.labels, labelToCustIdMap: Array.from(data.labelToCustIdMap.entries()) }
        ]);

        return {
            visualizationName: this.visualizationName,
            allItems: this.allItems, // allItems includes profilePic now
            embeddings: this.embeddings.map(e => Array.from(e)),
            data10D: this.data10D,
            data2D: this.data2D,
            arePointLabelsVisible: this.arePointLabelsVisible,
            currentLabels: this.currentLabels,
            minClusterSize: this.currentMinClusterSize,
            customizations: serializableCustomizations,
            clusteringData: serializableClusteringData,
            nextCustomizationId: this.nextCustomizationId,
            // Date State
            globalMinDate: this.globalMinDate,
            globalMaxDate: this.globalMaxDate,
            currentStartDate: this.currentStartDate,
            currentEndDate: this.currentEndDate
        };
    }

    setFullState(state) {
        this.visualizationName = state.visualizationName || "Untitled Visualization";
        this.allItems = state.allItems || [];
        this.arePointLabelsVisible = state.arePointLabelsVisible ?? true; 

        // Reconstruct profile pic map from loaded items
        this._recalculateProfilePics();

        const loadedEmbeddings = state.embeddings || [];
        if (loadedEmbeddings.length > 0 && !Array.isArray(loadedEmbeddings[0]) && typeof loadedEmbeddings[0] === 'object') {
            this.embeddings = loadedEmbeddings.map(obj => Object.values(obj));
        } else {
            this.embeddings = loadedEmbeddings;
        }

        this.data10D = state.data10D || [];
        this.data2D = state.data2D || [];
        this.currentLabels = state.currentLabels || [];
        this.currentMinClusterSize = state.minClusterSize || 5;
        this.nextCustomizationId = state.nextCustomizationId || 0;

        // Restore Dates
        this.globalMinDate = state.globalMinDate || 0;
        this.globalMaxDate = state.globalMaxDate || 0;
        this.currentStartDate = state.currentStartDate !== undefined ? state.currentStartDate : this.globalMinDate;
        this.currentEndDate = state.currentEndDate !== undefined ? state.currentEndDate : this.globalMaxDate;

        if (state.customizations) {
            this.allSettingsCustomizations = new Map(
                state.customizations.map(([size, custArray]) => [
                    size,
                    new Map(custArray.map(([id, custData]) => [id, { ...custData, memberIndices: new Set(custData.memberIndices) }]))
                ])
            );
        } else {
            this.allSettingsCustomizations = new Map();
        }

        if (state.clusteringData) {
            this.clusteringDataByMinSize = new Map(
                state.clusteringData.map(([size, data]) => [
                    size,
                    { labels: data.labels, labelToCustIdMap: new Map(data.labelToCustIdMap) }
                ])
            );
            const currentData = this.clusteringDataByMinSize.get(this.currentMinClusterSize);
            if (currentData) {
                this.labelToCustIdMap = currentData.labelToCustIdMap;
            }
        } else {
            this.clusteringDataByMinSize = new Map();
        }
    }
}