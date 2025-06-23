import { HDBSCAN } from "hdbscan-ts";

/**
 * Clusters data points using HDBSCAN.
 * @param {number[][]} data - The array of data points (e.g., 10D UMAP projections).
 * @param {number} minClusterSize - The minimum size of clusters.
 * @returns {number[]} An array of cluster labels for each data point. Noise points are labeled -1.
 */
export function clusterWithHDBSCAN(data, minClusterSize = 5) {
    console.log(`Running HDBSCAN with minClusterSize: ${minClusterSize}`);
    const hdbscan = new HDBSCAN({
        minClusterSize: minClusterSize,
        minSamples: 1, // Let minClusterSize be the main controller
        debugMode: false
    });
    
    const labels = hdbscan.fit(data);
    
    console.log("HDBSCAN finished.");
    return labels;
}