// Import the worker using Vite's suffix syntax
import ClusteringWorker from './clustering.worker.js?worker';

/**
 * Clusters data points using HDBSCAN in a background thread.
 * @param {number[][]} data - The array of data points (e.g., 10D UMAP projections).
 * @param {number} minClusterSize - The minimum size of clusters.
 * @returns {Promise<number[]>} A promise resolving to an array of cluster labels.
 */
export function clusterWithHDBSCAN(data, minClusterSize = 5) {
    return new Promise((resolve, reject) => {
        console.log(`Starting HDBSCAN worker with minClusterSize: ${minClusterSize}`);
        
        const worker = new ClusteringWorker();

        worker.onmessage = (e) => {
            const { type, labels, message } = e.data;
            if (type === 'success') {
                console.log("HDBSCAN worker finished.");
                resolve(labels);
            } else {
                console.error("HDBSCAN worker error:", message);
                reject(new Error(message));
            }
            worker.terminate(); // Clean up the worker
        };

        worker.onerror = (err) => {
            console.error("Worker connection error:", err);
            reject(err);
            worker.terminate();
        };

        // Send data to worker
        worker.postMessage({ data, minClusterSize });
    });
}