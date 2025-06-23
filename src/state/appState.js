export class AppState {
    constructor() {
        this.visualizationName = "Untitled Visualization";
        this.allItems = [];
        this.embeddings = [];
        this.data10D = [];
        this.data2D = [];

        this.currentLabels = [];
        this.currentMinClusterSize = 5;
        
        // Caches all data related to a specific clustering run
        // Map<minSize, { labels: number[], labelToCustIdMap: Map<number, number> }>
        this.clusteringDataByMinSize = new Map();

        // Stores customizations across different cluster size settings
        // Map<minSize, Map<custId, { name, visible, memberIndices }>>
        this.allSettingsCustomizations = new Map();
        
        // For the *current* clustering, maps a label (e.g., 5) to a persistent customization ID (e.g., 2)
        this.labelToCustIdMap = new Map();
        
        this.nextCustomizationId = 0;
    }

    // --- GETTERS ---
    getVisualizationName = () => this.visualizationName;
    getAllItems = () => this.allItems;
    getData2D = () => this.data2D;
    getData10D = () => this.data10D;
    getEmbeddings = () => this.embeddings;
    getLabels = () => this.currentLabels;
    getMinClusterSize = () => this.currentMinClusterSize;
    getCustomizationsForCurrentSize = () => this.allSettingsCustomizations.get(this.currentMinClusterSize) || new Map();
    getLabelToCustIdMap = () => this.labelToCustIdMap;
    getUniqueClusterCount = () => new Set(this.currentLabels.filter(l => l !== -1)).size;
    hasClusteringForSize = (size) => this.clusteringDataByMinSize.has(size);

    // --- SETTERS & STATE MODIFIERS ---
    setVisualizationName = (name) => { this.visualizationName = name; };

    setInitialData(allItems, embeddings, data10D, data2D) {
        this.allItems = allItems.map((item, i) => ({ ...item, embedding: embeddings[i] }));
        this.embeddings = embeddings;
        this.data10D = data10D;
        this.data2D = data2D;
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
            allItems: this.allItems,
            // Convert any typed arrays (e.g., Float32Array) to regular arrays for safe JSON serialization.
            embeddings: this.embeddings.map(e => Array.from(e)),
            data10D: this.data10D,
            data2D: this.data2D,
            currentLabels: this.currentLabels,
            minClusterSize: this.currentMinClusterSize,
            customizations: serializableCustomizations,
            clusteringData: serializableClusteringData,
            nextCustomizationId: this.nextCustomizationId
        };
    }

    setFullState(state) {
        this.visualizationName = state.visualizationName || "Untitled Visualization";
        this.allItems = state.allItems || [];

        // Handle old and new formats for embeddings to be backwards-compatible
        const loadedEmbeddings = state.embeddings || [];
        if (loadedEmbeddings.length > 0 && !Array.isArray(loadedEmbeddings[0]) && typeof loadedEmbeddings[0] === 'object') {
            console.warn("Old embedding format detected (object). Converting to array format.");
            this.embeddings = loadedEmbeddings.map(obj => Object.values(obj));
        } else {
            this.embeddings = loadedEmbeddings;
        }

        this.data10D = state.data10D || [];
        this.data2D = state.data2D || [];
        this.currentLabels = state.currentLabels || [];
        this.currentMinClusterSize = state.minClusterSize || 5;
        this.nextCustomizationId = state.nextCustomizationId || 0;

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