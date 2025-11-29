import { HDBSCAN } from "hdbscan-ts";

self.onmessage = (event) => {
    const { data, minClusterSize } = event.data;

    try {
        // Run the heavy computation
        const hdbscan = new HDBSCAN({
            minClusterSize: minClusterSize,
            minSamples: 1, 
            debugMode: false
        });
        
        // hdbscan-ts fit() returns the labels array directly
        const labels = hdbscan.fit(data);
        
        // Send results back to main thread
        self.postMessage({ type: 'success', labels });
    } catch (error) {
        self.postMessage({ type: 'error', message: error.message });
    }
};