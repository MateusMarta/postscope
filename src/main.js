import { AppState } from './state/appState.js';
import { HistoryManager } from './state/historyManager.js';
import { UIController } from './ui/uiController.js';
import { AnalysisPipeline } from './analysis/analysisPipeline.js';
import { EmbeddingVisualizer } from './ui/EmbeddingVisualizer.js';

const CURRENT_BOOKMARKLET_VERSION = 2;

document.addEventListener('DOMContentLoaded', async () => {
    const appState = new AppState();
    const historyManager = new HistoryManager();
    const visualizer = new EmbeddingVisualizer({ containerId: 'visualization-container' });
    const analysisPipeline = new AnalysisPipeline();

    const originalUrlFragment = window.location.hash;

    const saveCurrentState = () => {
        if (!originalUrlFragment) return;
        historyManager.saveStateForSession(originalUrlFragment, appState.getSerializableState());
        console.log("State save triggered.");
    };

    const ui = new UIController({
        onRecluster: async () => {
            const minClusterSize = ui.getMinClusterSize();
            if (isNaN(minClusterSize) || minClusterSize < 1) {
                ui.showError("Minimum Cluster Size must be a number of 1 or greater.");
                return;
            }

            appState.currentMinClusterSize = minClusterSize;

            if (appState.hasClusteringForSize(minClusterSize)) {
                ui.showLoading('Loading cached clusters...');
                await new Promise(resolve => setTimeout(resolve, 10));
                appState.switchToExistingClustering(minClusterSize);
                ui.render(appState, visualizer);
                ui.hideLoading(`Restored ${appState.getUniqueClusterCount()} clusters.`);
            } else {
                ui.showLoading('Updating clusters...');
                await new Promise(resolve => setTimeout(resolve, 10));
                const results = await analysisPipeline.runClustering(appState.getData10D(), minClusterSize);
                appState.updateClusteringResults(results.labels, minClusterSize);
                ui.render(appState, visualizer);
                ui.hideLoading(`Found ${appState.getUniqueClusterCount()} new clusters.`);
            }
            saveCurrentState();
        },
        onQuery: async (text) => {
            const coords = await analysisPipeline.transformSingle(text, appState.getAllItems(), appState.getData2D());
            visualizer.updateQueryPoint(text, coords);
        },
        onTitleChange: (newName) => {
            appState.setVisualizationName(newName);
            ui.setVisualizationTitle(newName);
            saveCurrentState();
        },
        onNameChange: (label, newName) => {
            appState.setClusterName(label, newName);
            visualizer.render(appState.getAllItems(), appState.getData2D(), appState.getLabels(), appState.getCustomizationsForCurrentSize(), appState.getLabelToCustIdMap(), appState.getArePointLabelsVisible());
            saveCurrentState();
        },
        onVisibilityChange: (label, isVisible) => {
            appState.setClusterVisibility(label, isVisible);
            ui.render(appState, visualizer);
            saveCurrentState();
        },
        onToggleLabels: () => {
           const newVisibility = visualizer.togglePointLabels();
           appState.setArePointLabelsVisible(newVisibility);
           ui.updateToggleLabelsButton(newVisibility);
           saveCurrentState();
        },
        getMapInstance: () => visualizer.getMapInstance()
    });

    const { data, context, savedState, historyEntry } = await historyManager.getSession(originalUrlFragment);

    if (savedState && savedState.data2D && savedState.data2D.length > 0) {
        // --- PATH A: Load from fully saved state ---
        ui.showLoading('Loading saved visualization...');
        
        appState.setFullState(savedState);
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
        ui.updateToggleLabelsButton(appState.getArePointLabelsVisible());
        ui.hideLoading(`Loaded ${appState.getUniqueClusterCount()} clusters from session.`);
        ui.enableControls();

    } else {
        // --- PATH B: Run new analysis ---
        if (!context || !data || data.length === 0) {
            const isHomePage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/';
            if (!isHomePage) {
               ui.showError("No data found. Please use the Postscope bookmarklet on a Twitter/X page.");
            }
            return;
        }

        if (!context.version || context.version < CURRENT_BOOKMARKLET_VERSION) {
            ui.showVersionWarning();
        }
        
        const visName = historyEntry ? historyEntry.name : 'Untitled Visualization';
        appState.setVisualizationName(visName);
        ui.setVisualizationTitle(visName);
        
        ui.setSourceInfo(context, data.length);
        ui.showLoading('Starting analysis...');
        ui.disableControls();

        try {
            const newHistoryEntry = await historyManager.saveNewHistoryEntry(context, data.length, originalUrlFragment);
            if(newHistoryEntry) {
                appState.setVisualizationName(newHistoryEntry.name);
                ui.setVisualizationTitle(newHistoryEntry.name);
            }

            const results = await analysisPipeline.runFullAnalysis(data, (progressMessage) => ui.showLoading(progressMessage));

            appState.setInitialData(data, results.embeddings, results.data10D, results.data2D);
            
            const initialMinSize = 5;
            ui.setMinClusterSize(initialMinSize);

            appState.updateClusteringResults(results.labels, initialMinSize);
            
            saveCurrentState();
            history.replaceState(null, '', ' ');

            ui.render(appState, visualizer);
            ui.updateToggleLabelsButton(appState.getArePointLabelsVisible());
            ui.hideLoading(`Analysis Complete. Found ${appState.getUniqueClusterCount()} clusters.`);
        } catch (error) {
            console.error("An error occurred during the analysis pipeline:", error);
            ui.showError(error.message);
        } finally {
            ui.enableControls();
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            saveCurrentState();
        }
    });
});