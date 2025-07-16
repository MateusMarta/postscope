import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export class EmbeddingVisualizer {
    constructor({ containerId }) {
        this.containerId = containerId;
        this.popup = null; // To hold the popup instance
        this.isDarkTheme = document.documentElement.classList.contains('dark');

        this.map = new maplibregl.Map({
            container: containerId,
            renderWorldCopies: false,
            style: {
                version: 8,
                glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
                sources: {},
                layers: [] // Layers will be added dynamically based on theme
            },
            center: [0, 0],
            zoom: 1
        });
        
        this.map.on('load', () => {
            this._updateMapTheme(); // Set initial theme for background
            this._setupInitialLayers();
            
            // Handle clicking on a point to open the post
            this.map.on('click', 'points-circles', (e) => {
                if (e.features?.[0]?.properties?.url) {
                    window.open(e.features[0].properties.url, '_blank', 'noopener,noreferrer');
                }
            });

            // Change cursor and show popup on hover
            this.map.on('mouseenter', 'points-circles', (e) => {
                this.map.getCanvas().style.cursor = 'pointer';
                const properties = e.features[0].properties;
                this._createPopup(e.lngLat, properties);
            });
            this.map.on('mouseleave', 'points-circles', () => {
                this.map.getCanvas().style.cursor = '';
                this._removePopup();
            });
        });
        
        // Listen for theme changes to update the map style
        window.addEventListener('themechange', this._updateMapTheme.bind(this));
    }

    _updateMapTheme() {
        if (!this.map || !this.map.isStyleLoaded()) return;

        this.isDarkTheme = document.documentElement.classList.contains('dark');
        const bgColor = this.isDarkTheme ? '#1e293b' : '#f1f5f9'; // slate-800 : slate-100
        
        if (this.map.getLayer('background')) {
            this.map.setPaintProperty('background', 'background-color', bgColor);
        } else {
            this.map.addLayer({
                'id': 'background',
                'type': 'background',
                'paint': { 'background-color': bgColor }
            }, this.map.getStyle().layers[0]?.id); // Add it at the bottom
        }

        // Update paint properties of existing layers if they exist
        const pointLabelTextColor = this.isDarkTheme ? '#e2e8f0' : '#0f172a'; // slate-200 : slate-900
        const pointLabelHaloColor = this.isDarkTheme ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)'; // slate-950 : white

        if (this.map.getLayer('point-labels')) {
            this.map.setPaintProperty('point-labels', 'text-color', pointLabelTextColor);
            this.map.setPaintProperty('point-labels', 'text-halo-color', pointLabelHaloColor);
        }
        if (this.map.getLayer('cluster-name-labels')) {
             this.map.setPaintProperty('cluster-name-labels', 'text-halo-color', this.isDarkTheme ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)'); // slate-800 : white
        }
        if (this.map.getLayer('query-point-circle')) {
            const queryPointColor = this.isDarkTheme ? '#f8fafc' : '#0f172a'; // slate-50 : slate-900
            const queryPointStroke = this.isDarkTheme ? '#1e293b' : '#ffffff'; // slate-800 : white
            this.map.setPaintProperty('query-point-circle', 'circle-color', queryPointColor);
            this.map.setPaintProperty('query-point-circle', 'circle-stroke-color', queryPointStroke);
        }
        if (this.map.getLayer('query-point-label')) {
            const queryLabelColor = this.isDarkTheme ? '#f8fafc' : '#0f172a';
            const queryLabelHalo = this.isDarkTheme ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)';
            this.map.setPaintProperty('query-point-label', 'text-color', queryLabelColor);
            this.map.setPaintProperty('query-point-label', 'text-halo-color', queryLabelHalo);
        }
    }

    getMapInstance = () => this.map;

    _createPopup(coordinates, properties) {
        this._removePopup(); // Remove any existing popup

        let timestampHtml = '';
        if (properties.timestamp) {
            try {
                const date = new Date(properties.timestamp);
                const formattedDate = date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                timestampHtml = `<span class="popup-timestamp">${formattedDate}</span>`;
            } catch (e) { /* ignore invalid date */ }
        }

        const popupContent = `
            <div class="post-popup-content">
                <div class="popup-header">
                    <strong class="popup-author">@${properties.author}</strong>
                    ${timestampHtml}
                </div>
                <div class="popup-body">${properties.text}</div>
                <div class="popup-footer">
                    <span class="popup-likes">❤️ ${properties.likes}</span>
                </div>
            </div>
        `;
        
        this.popup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            className: 'post-popup'
        })
        .setLngLat(coordinates)
        .setHTML(popupContent)
        .addTo(this.map);
    }
    
    _removePopup() {
        if (this.popup) {
            this.popup.remove();
            this.popup = null;
        }
    }

    _setupInitialLayers() {
        this.map.addSource('points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        this.map.addSource('query-point', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        this.map.addSource('cluster-names', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        this.map.addSource('highlight-point', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        
        const pointLabelTextColor = this.isDarkTheme ? '#e2e8f0' : '#0f172a'; // slate-200 : slate-900
        const pointLabelHaloColor = this.isDarkTheme ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)'; // slate-950 : white

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
            paint: { 'text-color': pointLabelTextColor, 'text-halo-color': pointLabelHaloColor, 'text-halo-width': 1 }
        });
        
        this.map.addLayer({
            id: 'cluster-name-labels', type: 'symbol', source: 'cluster-names',
            layout: { 'text-field': ['get', 'name'], 'text-size': 16, 'text-font': ["Noto Sans Bold"], 'text-allow-overlap': true, 'text-ignore-placement': true },
            paint: { 'text-color': ['get', 'color'], 'text-halo-color': this.isDarkTheme ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)', 'text-halo-width': 2, 'text-halo-blur': 1 }
        });

        this.map.addLayer({
            id: 'highlight-point-circle', type: 'circle', source: 'highlight-point',
            paint: {
                'circle-radius': 12,
                'circle-color': 'rgba(0,0,0,0)',
                'circle-stroke-width': 3,
                'circle-stroke-color': '#0ea5e9' // sky-500
            }
        });
        
        const queryPointColor = this.isDarkTheme ? '#f8fafc' : '#0f172a'; // slate-50 : slate-900
        const queryPointStroke = this.isDarkTheme ? '#1e293b' : '#ffffff'; // slate-800 : white
        const queryLabelColor = this.isDarkTheme ? '#f8fafc' : '#0f172a';
        const queryLabelHalo = this.isDarkTheme ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)';

        this.map.addLayer({
            id: 'query-point-circle', type: 'circle', source: 'query-point',
            paint: { 'circle-radius': 10, 'circle-color': queryPointColor, 'circle-stroke-width': 3, 'circle-stroke-color': queryPointStroke }
        });
        
        this.map.addLayer({
            id: 'query-point-label', type: 'symbol', source: 'query-point',
            layout: { 'text-field': ['get', 'text'], 'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 1.2, 'text-size': 14, 'text-font': ["Noto Sans Bold"] },
            paint: { 'text-color': queryLabelColor, 'text-halo-color': queryLabelHalo, 'text-halo-width': 2 }
        });
    }

    _getColorForLabel(label, uniqueLabels) {
        if (label === -1) return '#94a3b8'; // slate-400
        const index = uniqueLabels.indexOf(label);
        if (index === -1) return this.isDarkTheme ? '#e2e8f0' : '#0f172a';
        const hue = (index * (360 / (uniqueLabels.length + 1))) % 360;
        const saturation = this.isDarkTheme ? 70 : 80;
        const lightness = this.isDarkTheme ? 60 : 50;
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    _generateColorScale(labels) {
        const uniqueLabels = [...new Set(labels)].filter(l => l !== -1).sort((a, b) => a - b);
        const colorScale = ['match', ['get', 'cluster_label']];
        [...uniqueLabels, -1].forEach(label => {
            colorScale.push(label, this._getColorForLabel(label, uniqueLabels));
        });
        colorScale.push(this.isDarkTheme ? '#e2e8f0' : '#0f172a'); // Fallback
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
            properties: { 
                text: point.content, 
                author: point.author,
                timestamp: point.timestamp,
                likes: point.likes || 0,
                url: point.url,
                cluster_label: labels[i]
            }
        }))};
        this.map.getSource('points').setData(geojson);
        
        if (this.map.getLayer('points-circles')) this.map.removeLayer('points-circles');
        
        const circleStrokeColor = this.isDarkTheme ? 'rgba(15, 23, 42, 0.5)' : 'rgba(255, 255, 255, 0.8)'; // slate-950 / white
        
        this.map.addLayer({
            id: 'points-circles', type: 'circle', source: 'points',
            layout: { 'circle-sort-key': ['coalesce', ['get', 'likes'], 0] },
            paint: {
                'circle-radius': ['+', 4, ['*', 2, ['log10', ['+', 1, ['coalesce', ['get', 'likes'], 0]]]]],
                'circle-color': this._generateColorScale(labels),
                'circle-stroke-width': 1, 'circle-stroke-color': circleStrokeColor
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

    highlightPoint(coords) {
        if (!this.map.isStyleLoaded()) {
            this.map.once('load', () => this.highlightPoint(coords));
            return;
        }
        const source = this.map.getSource('highlight-point');
        if (!source) return;

        if (!coords) {
            source.setData({ type: 'FeatureCollection', features: [] });
            return;
        }
        
        source.setData({
            type: "FeatureCollection",
            features: [{
                type: "Feature",
                geometry: { type: "Point", coordinates: coords },
                properties: {}
            }]
        });
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