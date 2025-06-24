import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export class EmbeddingVisualizer {
    constructor({ containerId }) {
        this.containerId = containerId;
        this.map = new maplibregl.Map({
            container: containerId,
            renderWorldCopies: false,
            style: {
                version: 8,
                glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
                sources: {},
                layers: [{
                    'id': 'background',
                    'type': 'background',
                    'paint': {
                        'background-color': '#f9f9f9'
                    }
                }]
            },
            center: [0, 0],
            zoom: 1
        });
        
        this.map.on('load', () => this._setupInitialLayers());
    }

    getMapInstance = () => this.map;

    _setupInitialLayers() {
        this.map.addSource('points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        this.map.addSource('query-point', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        this.map.addSource('cluster-names', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

        this.map.addLayer({
            id: 'point-labels',
            type: 'symbol',
            source: 'points',
            minzoom: 3,
            layout: {
                'text-field': ['get', 'text'],
                'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
                'text-radial-offset': ['+', 0.5, ['*', 0.1, ['log10', ['+', 1, ['coalesce', ['get', 'likes'], 0]]]]],
                'text-justify': 'auto',
                'text-size': 12,
                'symbol-sort-key': ['*', -1, ['coalesce', ['get', 'likes'], 0]],
                'text-allow-overlap': false,
                'text-ignore-placement': false
            },
            paint: { 'text-color': '#000000', 'text-halo-color': '#ffffff', 'text-halo-width': 1 }
        });
        
        this.map.addLayer({
            id: 'cluster-name-labels', type: 'symbol', source: 'cluster-names',
            layout: { 'text-field': ['get', 'name'], 'text-size': 16, 'text-font': ["Noto Sans Bold"], 'text-allow-overlap': true, 'text-ignore-placement': true },
            paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#ffffff', 'text-halo-width': 2, 'text-halo-blur': 1 }
        });

        this.map.addLayer({
            id: 'query-point-circle', type: 'circle', source: 'query-point',
            paint: { 'circle-radius': 10, 'circle-color': '#000000', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' }
        });
        
        this.map.addLayer({
            id: 'query-point-label', type: 'symbol', source: 'query-point',
            layout: { 'text-field': ['get', 'text'], 'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 1.2, 'text-size': 14, 'text-font': ["Noto Sans Bold"] },
            paint: { 'text-color': '#000000', 'text-halo-color': '#ffffff', 'text-halo-width': 2 }
        });
    }

    _getColorForLabel(label, uniqueLabels) {
        if (label === -1) return '#cccccc';
        const index = uniqueLabels.indexOf(label);
        if (index === -1) return '#000000';
        const hue = (index * (360 / (uniqueLabels.length + 1))) % 360;
        return `hsl(${hue}, 80%, 50%)`;
    }

    _generateColorScale(labels) {
        const uniqueLabels = [...new Set(labels)].filter(l => l !== -1).sort((a, b) => a - b);
        const colorScale = ['match', ['get', 'cluster_label']];
        [...uniqueLabels, -1].forEach(label => {
            colorScale.push(label, this._getColorForLabel(label, uniqueLabels));
        });
        colorScale.push('#000000'); // Fallback
        return colorScale;
    }
    
    _updateClusterNameLayer(twoDimCoords, labels, customizations, labelToCustIdMap) {
        const nameFeatures = [];
        const uniqueLabels = [...new Set(labels)].filter(l => l !== -1).sort((a, b) => a - b);
        const clusters = new Map();

        labels.forEach((label, i) => {
            if (label === -1) return;
            if (!clusters.has(label)) clusters.set(label, { sumX: 0, sumY: 0, count: 0 });
            const cluster = clusters.get(label);
            cluster.sumX += twoDimCoords[i][0];
            cluster.sumY += twoDimCoords[i][1];
            cluster.count++;
        });

        for (const [label, custId] of labelToCustIdMap.entries()) {
            const cust = customizations.get(custId);
            if (cust && cust.name && cust.visible) {
                const clusterData = clusters.get(label);
                if (clusterData && clusterData.count > 0) {
                    nameFeatures.push({
                        type: "Feature",
                        geometry: { type: "Point", coordinates: [clusterData.sumX / clusterData.count, clusterData.sumY / clusterData.count] },
                        properties: { name: cust.name, color: this._getColorForLabel(label, uniqueLabels) }
                    });
                }
            }
        }
        this.map.getSource('cluster-names').setData({ type: 'FeatureCollection', features: nameFeatures });
    }

    render(pointsData, twoDimCoords, labels, customizations, labelToCustIdMap, areLabelsVisible) {
        if (!this.map.isStyleLoaded() || twoDimCoords.length === 0) {
            this.map.once('load', () => this.render(...arguments));
            return;
        }

        const geojson = { type: "FeatureCollection", features: pointsData.map((point, i) => ({
            type: "Feature", geometry: { type: "Point", coordinates: [twoDimCoords[i][0], twoDimCoords[i][1]] },
            properties: { text: point.content, originalText: point.originalText, cluster_label: labels[i], likes: point.likes || 0 }
        }))};
        this.map.getSource('points').setData(geojson);
        
        if (this.map.getLayer('points-circles')) this.map.removeLayer('points-circles');
        this.map.addLayer({
            id: 'points-circles', type: 'circle', source: 'points',
            layout: { 'circle-sort-key': ['coalesce', ['get', 'likes'], 0] },
            paint: {
                'circle-radius': ['+', 4, ['*', 2, ['log10', ['+', 1, ['coalesce', ['get', 'likes'], 0]]]]],
                'circle-color': this._generateColorScale(labels),
                'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff'
            }
        }, 'point-labels');
        
        if (this.map.getLayer('point-labels')) {
            this.map.setLayoutProperty('point-labels', 'visibility', areLabelsVisible ? 'visible' : 'none');
        }
        
        if (customizations && labelToCustIdMap) {
            this._updateClusterNameLayer(twoDimCoords, labels, customizations, labelToCustIdMap);
        } else {
            const source = this.map.getSource('cluster-names');
            if (source) source.setData({ type: 'FeatureCollection', features: [] });
        }

        const bounds = new maplibregl.LngLatBounds();
        twoDimCoords.forEach(coord => bounds.extend(coord));
        
        this.map.resize();
        if (!bounds.isEmpty()) {
            this.map.fitBounds(bounds, { padding: 50, maxZoom: 8, duration: 0 });
        }
    }

    updateQueryPoint(text, coords) {
        if (!this.map.isStyleLoaded()) {
            this.map.once('load', () => this.updateQueryPoint(text, coords));
            return;
        }
        const source = this.map.getSource('query-point');
        if (!source) return;
        if (!text || !coords) {
            source.setData({ type: 'FeatureCollection', features: [] });
            return;
        }
        source.setData({ type: "FeatureCollection", features: [{
            type: "Feature", geometry: { type: "Point", coordinates: [coords[0], coords[1]] }, properties: { text }
        }]});
    }

    togglePointLabels() {
        const layerId = 'point-labels';
        if (!this.map.getLayer(layerId)) return;
        const visibility = this.map.getLayoutProperty(layerId, 'visibility');
        const newVisibility = (visibility === 'visible' || visibility === undefined) ? 'none' : 'visible';
        this.map.setLayoutProperty(layerId, 'visibility', newVisibility);
        return newVisibility === 'visible';
    }
}