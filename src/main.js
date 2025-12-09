import { AppState } from './state/appState.js';
import { HistoryManager } from './state/historyManager.js';
import { UIController } from './ui/uiController.js';
import { AnalysisPipeline } from './analysis/analysisPipeline.js';
import { EmbeddingVisualizer } from './ui/EmbeddingVisualizer.js';

const CURRENT_BOOKMARKLET_VERSION = 5;

document.addEventListener('DOMContentLoaded', async () => {
    const appState = new AppState();
    const historyManager = new HistoryManager();
    const visualizer = new EmbeddingVisualizer({ containerId: 'visualization-container' });
    const analysisPipeline = new AnalysisPipeline();

    // Store the ID of the current session to update state later
    let currentSessionId = null;

    // Store the current query coordinates here
    let currentQueryCoords = null;

    const saveCurrentState = () => {
        if (!currentSessionId) return;
        historyManager.updateState(currentSessionId, appState.getSerializableState());
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
                // Pass 'true' to fitBounds ONLY on explicit recluster/reset
                ui.render(appState, visualizer, true); 
                ui.hideLoading(`Restored ${appState.getUniqueClusterCount()} clusters.`);
            } else {
                ui.showLoading('Updating clusters...');
                await new Promise(resolve => setTimeout(resolve, 10));
                const results = await analysisPipeline.runClustering(appState.getData10D(), minClusterSize);
                appState.updateClusteringResults(results.labels, minClusterSize);
                ui.render(appState, visualizer, true);
                ui.hideLoading(`Found ${appState.getUniqueClusterCount()} new clusters.`);
            }
            saveCurrentState();
        },
        onQuery: async (text) => {
            const coords = await analysisPipeline.transformSingle(text, appState.getAllItems(), appState.getData2D());
            currentQueryCoords = coords; // Store coords
            visualizer.updateQueryPoint(text, coords);
        },
        onFocusQuery: () => {
            if (currentQueryCoords) {
                visualizer.focusOnLocation(currentQueryCoords);
            }
        },
        onTitleChange: (newName) => {
            appState.setVisualizationName(newName);
            ui.setVisualizationTitle(newName);
            saveCurrentState();
        },
        onNameChange: (label, newName) => {
            appState.setClusterName(label, newName);
            // Do NOT fit bounds on name change
            ui.render(appState, visualizer, false); 
            saveCurrentState();
        },
        onVisibilityChange: (label, isVisible) => {
            appState.setClusterVisibility(label, isVisible);
            ui.render(appState, visualizer, false);
            saveCurrentState();
        },
        onToggleLabels: () => {
           const newVisibility = visualizer.togglePointLabels();
           appState.setArePointLabelsVisible(newVisibility);
           ui.updateToggleLabelsButton(newVisibility);
           saveCurrentState();
        },
        onPostSelect: (index) => {
            if (index === null) {
                visualizer.highlightPoint(null);
                return;
            }
            const coords = appState.getData2D()[index];
            if (coords) {
                visualizer.highlightPoint(coords);
            }
        },
        onTimeRangeChange: (start, end) => {
            appState.setTimeRange(start, end);
            ui.render(appState, visualizer, false);
            saveCurrentState();
        },
        getMapInstance: () => visualizer.getMapInstance()
    });

    // Helper to run the analysis pipeline and save results
    const runAnalysisPipeline = async (data, context) => {
        ui.setSourceInfo(context, data.length);
        ui.disableControls();

        try {
            const results = await analysisPipeline.runFullAnalysis(data, (progressMessage) => ui.showLoading(progressMessage));

            appState.setInitialData(data, results.embeddings, results.data10D, results.data2D);
            const initialMinSize = 5;
            ui.setMinClusterSize(initialMinSize);
            appState.updateClusteringResults(results.labels, initialMinSize);
            
            // Initialize timeline with new data
            ui.initializeTimeline(appState);

            // Save complete state to the existing DB entry
            saveCurrentState();

            ui.render(appState, visualizer, true);
            ui.updateToggleLabelsButton(appState.getArePointLabelsVisible());
            ui.hideLoading(`Analysis Complete. Found ${appState.getUniqueClusterCount()} clusters.`);
        } catch (error) {
            console.error("Analysis Error:", error);
            ui.showError(`Analysis failed: ${error.message}`);
        } finally {
            ui.enableControls();
        }
    };

    // Check URL Hash for Session ID
    const urlHash = window.location.hash;
    const session = await historyManager.getSession(urlHash);

    if (session.historyEntry) {
        // --- PATH A: Load from DB (Resume or View) ---
        currentSessionId = session.historyEntry.id;

        if (session.savedState) {
            // Case A1: Fully saved state exists. Restore it.
            ui.showLoading('Loading saved visualization...');
            appState.setFullState(session.savedState);
            const visName = session.savedState.visualizationName || session.historyEntry.name;
            appState.setVisualizationName(visName);
            ui.setVisualizationTitle(visName);
            
            ui.showLoading('Initializing models for queries...');
            await analysisPipeline.semanticEmbedding.init();
            await analysisPipeline.semanticEmbedding.initLocalEmbedder();
            analysisPipeline.rehydrate(appState.getEmbeddings(), appState.getData10D(), appState.getData2D());

            ui.setMinClusterSize(appState.getMinClusterSize());
            ui.setSourceInfo(session.context, appState.getAllItems().length);
            
            // Initialize timeline from restored state
            ui.initializeTimeline(appState);

            ui.render(appState, visualizer, true);
            ui.updateToggleLabelsButton(appState.getArePointLabelsVisible());
            ui.hideLoading(`Loaded ${appState.getUniqueClusterCount()} clusters from session.`);
            ui.enableControls();
        } else if (session.data) {
            // Case A2: Raw data exists, but analysis wasn't finished. Resume analysis.
            ui.showLoading('Resuming analysis from saved data...');
            const visName = session.historyEntry.name;
            appState.setVisualizationName(visName);
            ui.setVisualizationTitle(visName);
            
            // Re-run pipeline on stored data
            await runAnalysisPipeline(session.data, session.context);
        }

    } else if (session.waitingForData) {
        // --- PATH B: New Data via PostMessage ---
        const isHomePage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/';
        if (isHomePage) {
            return;
        }

        ui.showLoading('Waiting for data from Twitter/X...');
        
        const received = await historyManager.waitForData();
        
        if (!received) {
            ui.showError("No data received. Please try running the Postscope bookmarklet again.");
            return;
        }

        const { data, context } = received;
        
        if (!context.version || context.version < CURRENT_BOOKMARKLET_VERSION) {
            ui.showVersionWarning();
        }

        // 1. SAVE RAW DATA IMMEDIATELY to prevent data loss
        const initialEntry = await historyManager.createInitialHistoryEntry(context, data);
        currentSessionId = initialEntry.id;
        
        // Update URL immediately so a refresh picks up from Case A2 above
        history.replaceState(null, '', `#${currentSessionId}`);
        appState.setVisualizationName(initialEntry.name);
        ui.setVisualizationTitle(initialEntry.name);

        ui.showLoading('Starting analysis...');

        // 2. RUN ANALYSIS
        await runAnalysisPipeline(data, context);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            saveCurrentState();
        }
    });
});