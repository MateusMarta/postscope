import { EmbeddingsCache } from './EmbeddingsCache.js';
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0';
env.allowLocalModels = false;
const model_name = 'Xenova/GIST-small-Embedding-v0'

export class SemanticEmbedding {
    constructor() {
        this.cache = new EmbeddingsCache();
        this.embedder = null;
    }

    async init() {
        await this.cache.init();
    }

    async clearCache() {
        await this.cache.clearCache();
    }

    async initLocalEmbedder(progress_callback) {
        if (this.embedder) {
            return;
        }
        this.embedder = await pipeline('feature-extraction', model_name,
        {
            quantized: true,
            progress_callback: data => {
                if (progress_callback && data.status === 'progress') {
                    const { progress, loaded, total } = data
                    const totalMB = Math.round(total / (1024 * 1024));
                    const loadedMB = Math.round(loaded / (1024 * 1024));
                    progress_callback({ progress, loadedMB, totalMB});                    
                }
            }
        });
    }

    async embed(textArray, progressCallback) {
        if (!this.embedder) {
            throw new Error("Embedding model not initialized. Call initLocalEmbedder first.");
        }

        const results = [];
        const total = textArray.length;
        const showProgress = total > 1 && progressCallback;

        for (let i = 0; i < textArray.length; i++) {
            const text = textArray[i];
            if (showProgress) {
                progressCallback(`<div class="spinner"></div><p>Embedding text: ${i + 1} / ${total}</p>`);
            }
            const embeddingVector = await this.cache.getOrCreateEmbeddings(text, async (t) => {
                const output = await this.embedder(t, { pooling: 'mean', normalize: true });
                return output.data;
            });
            results.push(embeddingVector);
            
            if ((i + 1) % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        return results;
    }
}