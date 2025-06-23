import { AppState } from './state/appState.js';
import { HistoryManager } from './state/historyManager.js';
import { UIController } from './ui/uiController.js';
import { AnalysisPipeline } from './analysis/analysisPipeline.js';
import { EmbeddingVisualizer } from './ui/EmbeddingVisualizer.js';

document.addEventListener('DOMContentLoaded', async () => {
    const appState = new AppState();
    const historyManager = new HistoryManager('postscopeHistory');
    const visualizer = new EmbeddingVisualizer({ containerId: 'visualization-container' });
    const analysisPipeline = new AnalysisPipeline();

    const ui = new UIController({
        onRecluster: async () => {
            const minClusterSize = ui.getMinClusterSize();
            if (isNaN(minClusterSize) || minClusterSize < 1) {
                ui.showError("Minimum Cluster Size must be a number of 1 or greater.");
                return;
            }

            if (appState.hasClusteringForSize(minClusterSize)) {
                ui.showLoading('Loading cached clusters...');
                await new Promise(resolve => setTimeout(resolve, 10));
                appState.switchToExistingClustering(minClusterSize);
                ui.render(appState, visualizer);
                ui.hideLoading(`Restored ${appState.getUniqueClusterCount()} clusters.`);
                return;
            }

            ui.showLoading('Updating clusters...');
            await new Promise(resolve => setTimeout(resolve, 10));

            const results = await analysisPipeline.runClustering(appState.getData10D(), minClusterSize);
            appState.updateClusteringResults(results.labels, minClusterSize);
            
            ui.render(appState, visualizer);
            ui.hideLoading(`Found ${appState.getUniqueClusterCount()} new clusters.`);
        },
        onQuery: async (text) => {
            const coords = await analysisPipeline.transformSingle(text, appState.getAllItems(), appState.getData2D());
            visualizer.updateQueryPoint(text, coords);
        },
        onTitleChange: (newName) => {
            appState.setVisualizationName(newName);
            ui.setVisualizationTitle(newName); // Re-render title to reflect change
        },
        onNameChange: (label, newName) => {
            appState.setClusterName(label, newName);
            visualizer.render(appState.getAllItems(), appState.getData2D(), appState.getLabels(), appState.getCustomizationsForCurrentSize(), appState.getLabelToCustIdMap());
        },
        onVisibilityChange: (label, isVisible) => {
            appState.setClusterVisibility(label, isVisible);
            ui.render(appState, visualizer);
        },
        onToggleLabels: () => {
           const isVisible = visualizer.togglePointLabels();
           ui.updateToggleLabelsButton(isVisible);
        },
        getMapInstance: () => visualizer.getMapInstance()
    });

    const originalUrlFragment = window.location.hash;
    const { data, context, savedState, historyEntry } = historyManager.getSession(originalUrlFragment);

    if (savedState && savedState.data2D && savedState.data2D.length > 0) {
        // --- PATH A: Load from fully saved state ---
        console.log("Found complete saved state. Loading...");
        ui.showLoading('Loading saved visualization...');
        
        appState.setFullState(savedState);
        // The name in the saved state is most recent, so prioritize it.
        const visName = savedState.visualizationName || (historyEntry ? historyEntry.name : 'Untitled Visualization');
        appState.setVisualizationName(visName);
        ui.setVisualizationTitle(visName);
        
        ui.showLoading('Initializing models for queries...');
        await analysisPipeline.semanticEmbedding.init();
        await analysisPipeline.semanticEmbedding.initLocalEmbedder();
        analysisPipeline.rehydrate(appState.getEmbeddings(), appState.getData10D(), appState.getData2D());

        ui.setMinClusterSize(appState.getMinClusterSize());
        ui.setSourceInfo(context, appState.getAllItems().length);
        
        history.replaceState(null, '', ' ');
        await new Promise(resolve => setTimeout(resolve, 50)); 
        
        ui.render(appState, visualizer);
        ui.hideLoading(`Loaded ${appState.getUniqueClusterCount()} clusters from session.`);
        ui.enableControls();

    } else {
        // --- PATH B: Run new analysis ---
        if (!data || data.length === 0) {
            ui.showError("No data found. Please use the Postscope bookmarklet on a Twitter/X page.");
            return;
        }
        
        // Use history entry name if available (e.g., user re-clicked link from index)
        const visName = historyEntry ? historyEntry.name : 'Untitled Visualization';
        appState.setVisualizationName(visName);
        ui.setVisualizationTitle(visName);
        
        ui.setSourceInfo(context, data.length);
        ui.showLoading('Starting analysis...');
        ui.disableControls();

        try {
            const results = await analysisPipeline.runFullAnalysis(data, (progressMessage) => ui.showLoading(progressMessage));

            appState.setInitialData(data, results.embeddings, results.data10D, results.data2D);
            const initialMinSize = localStorage.getItem('min-cluster-size') || 5;
            ui.setMinClusterSize(initialMinSize);

            appState.updateClusteringResults(results.labels, parseInt(initialMinSize, 10));

            historyManager.saveNewHistoryEntry(context, data.length, originalUrlFragment);
            // After creating the entry, get the default name and set it
            const newEntry = historyManager.getSession(originalUrlFragment).historyEntry;
            if(newEntry) {
                appState.setVisualizationName(newEntry.name);
                ui.setVisualizationTitle(newEntry.name);
            }

            history.replaceState(null, '', ' ');

            ui.render(appState, visualizer);
            ui.hideLoading(`Analysis Complete. Found ${appState.getUniqueClusterCount()} clusters.`);
        } catch (error) {
            console.error("An error occurred during the analysis pipeline:", error);
            ui.showError(error.message);
        } finally {
            ui.enableControls();
        }
    }

    window.addEventListener('beforeunload', () => {
        // Ensure the latest name from the app state is synced to the history list
        historyManager.updateNameForSession(originalUrlFragment, appState.getVisualizationName());
        historyManager.saveStateForSession(originalUrlFragment, appState.getSerializableState());
        localStorage.setItem('min-cluster-size', ui.getMinClusterSize());
    });
});