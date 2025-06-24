import { UMAP } from 'https://esm.sh/umap-js@1.4.0';
import { SemanticEmbedding } from '../services/SemanticEmbedding.js';
import { clusterWithHDBSCAN } from '../services/Clustering.js';

const RANDOM_SEED = 1991;
function mulberry32(a) { return function() { var t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; } }

export class AnalysisPipeline {
    constructor() {
        this.semanticEmbedding = new SemanticEmbedding();
        this.umap10D = null;
        this.umap2D = null;
        this.queryCoordsCache = new Map();
    }

    /**
     * Re-initializes UMAP models with existing data.
     * This is used when loading a saved state to enable the .transform() method for new queries
     * without re-running the entire expensive fitting process.
     * @param {number[][]} embeddings The original high-dimensional embeddings.
     * @param {number[][]} data10D The pre-computed 10D projections of the embeddings.
     * @param {number[][]} data2D The pre-computed 2D projections of the embeddings.
     */
    rehydrate(embeddings, data10D, data2D) {
        if (!embeddings || embeddings.length === 0) {
            console.error("Cannot rehydrate pipeline without embeddings.");
            return;
        }
        if (!data10D || !data2D) {
            console.error("Cannot rehydrate pipeline without pre-computed projections.");
            return;
        }

        const nNeighbors = Math.min(15, embeddings.length - 1);
        if (nNeighbors < 2) return;

        // Create a single, shared random number generator for deterministic rehydration.
        const random = mulberry32(RANDOM_SEED);

        // Rehydrate the 10D UMAP model.
        this.umap10D = new UMAP({ nComponents: 10, nNeighbors, random });
        this.umap10D.initializeFit(embeddings);
        this.umap10D.embedding = data10D;

        // Rehydrate the 2D UMAP model.
        this.umap2D = new UMAP({ nComponents: 2, nNeighbors, minDist: 0.1, random });
        this.umap2D.initializeFit(embeddings);
        this.umap2D.embedding = data2D;
    }

    async runFullAnalysis(allItems, progressCallback) {
        this.queryCoordsCache.clear();
        await this.semanticEmbedding.init();
        
        progressCallback('<div class="spinner"></div><p>Loading analysis model...</p>');
        await this.semanticEmbedding.initLocalEmbedder(({ loadedMB, totalMB }) => {
            progressCallback(`<div class="spinner"></div><p>Loading model: ${loadedMB} / ${totalMB} MB</p>`);
        });

        const textArray = allItems.map(item => item.content);
        const embeddings = await this.semanticEmbedding.embed(textArray, progressCallback);

        const nNeighbors = Math.min(15, allItems.length - 1);
        if (nNeighbors < 2) {
            throw new Error(`Not enough data points to create a map.`);
        }
        
        // Create a single, shared random number generator for the entire pipeline.
        // This ensures the results are perfectly reproducible.
        const random = mulberry32(RANDOM_SEED);

        progressCallback('<div class="spinner"></div><p>Mapping dimensions (1/2)...</p>');
        this.umap10D = new UMAP({ nComponents: 10, nNeighbors, random });
        const nEpochs10D = this.umap10D.initializeFit(embeddings);
        for (let i = 0; i < nEpochs10D; i++) {
            this.umap10D.step();
            if (i % 10 === 0) {
                const progress = Math.round((i / nEpochs10D) * 100);
                progressCallback(`<div class="spinner"></div><p>Mapping dimensions (1/2): ${progress}%</p>`);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        const data10D = this.umap10D.getEmbedding();

        progressCallback('<div class="spinner"></div><p>Mapping dimensions (2/2)...</p>');
        this.umap2D = new UMAP({ nComponents: 2, nNeighbors, minDist: 0.1, random });
        const nEpochs2D = this.umap2D.initializeFit(embeddings);
        for (let i = 0; i < nEpochs2D; i++) {
            this.umap2D.step();
             if (i % 10 === 0) {
                const progress = Math.round((i / nEpochs2D) * 100);
                progressCallback(`<div class="spinner"></div><p>Mapping dimensions (2/2): ${progress}%</p>`);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        const data2D = this.umap2D.getEmbedding();

        progressCallback('<div class="spinner"></div><p>Grouping posts...</p>');
        const labels = clusterWithHDBSCAN(data10D, 5);

        return { embeddings, data10D, data2D, labels };
    }

    async runClustering(data10D, minClusterSize) {
        if (!data10D) throw new Error("10D data not available for clustering.");
        const labels = clusterWithHDBSCAN(data10D, minClusterSize);
        return { labels };
    }

    async transformSingle(text, allItems, data2D) {
        if (!text) {
            this.queryCoordsCache.delete('__last_query__');
            return null;
        }
        if (!this.semanticEmbedding || !this.umap2D) {
            console.error("Analysis pipeline not ready for transform.");
            return null;
        }

        const existingItemIndex = allItems.findIndex(item => item.content === text);
        if (existingItemIndex !== -1 && data2D) {
            return data2D[existingItemIndex];
        }

        if (this.queryCoordsCache.has(text)) {
            return this.queryCoordsCache.get(text);
        }

        const [embedding] = await this.semanticEmbedding.embed([text]);
        const [coords] = this.umap2D.transform([embedding]);
        
        this.queryCoordsCache.set(text, coords);
        return coords;
    }
}