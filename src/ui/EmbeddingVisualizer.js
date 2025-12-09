import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export class EmbeddingVisualizer {
    constructor({ containerId }) {
        this.containerId = containerId;
        this.popup = null; // To hold the popup instance
        this.isDarkTheme = document.documentElement.classList.contains('dark');
        this.loadedImages = new Set(); // Track loaded author images

        this.map = new maplibregl.Map({
            container: containerId,
            renderWorldCopies: false,
            attributionControl: false,
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

        // Default placeholder if no profile pic
        let avatarHtml = `<div class="popup-avatar-placeholder">${properties.author.charAt(0).toUpperCase()}</div>`;
        if (properties.profile_pic) {
            avatarHtml = `<img src="${properties.profile_pic}" class="popup-avatar" alt="${properties.author}" onerror="this.style.display='none'"/>`;
        }

        const popupContent = `
            <div class="post-popup-content">
                <div class="popup-header-row">
                    <div class="popup-avatar-container">
                        ${avatarHtml}
                    </div>
                    <div class="popup-meta">
                        <strong class="popup-author">@${properties.author}</strong>
                        ${timestampHtml}
                    </div>
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
            className: 'post-popup',
            maxWidth: '320px',
            offset: 15
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
                'text-radial-offset': ['+', 1.0, ['*', 0.1, ['log10', ['+', 1, ['coalesce', ['get', 'likes'], 0]]]]],
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
                'circle-radius': 18,
                'circle-color': 'rgba(0,0,0,0)',
                'circle-stroke-width': 4,
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

    _loadAuthorImages(authors, authorProfilePicsMap) {
        authors.forEach(author => {
            if (!this.loadedImages.has(author)) {
                this.loadedImages.add(author); // Mark as requested to avoid duplicate calls
                
                const data = authorProfilePicsMap.get(author);
                if (data && data.url) {
                    const img = new Image();
                    img.crossOrigin = "Anonymous";
                    img.src = data.url;
                    img.onload = () => {
                        // Create a circular crop of the profile picture
                        const canvas = document.createElement('canvas');
                        const size = 64; // Standard size for texture
                        canvas.width = size;
                        canvas.height = size;
                        const ctx = canvas.getContext('2d');
                        
                        ctx.beginPath();
                        ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
                        ctx.closePath();
                        ctx.clip();
                        
                        ctx.drawImage(img, 0, 0, size, size);
                        
                        if (!this.map.hasImage(author)) {
                            this.map.addImage(author, ctx.getImageData(0, 0, size, size));
                        }
                    };
                    img.onerror = () => {
                        console.warn(`Failed to load profile pic for ${author}`);
                    };
                }
            }
        });
    }

    render(pointsData, twoDimCoords, labels, customizations, labelToCustIdMap, areLabelsVisible, authorProfilePicsMap, shouldFitBounds = false) {
        if (!this.map.isStyleLoaded() || twoDimCoords.length === 0) {
            this.map.once('load', () => this.render(...arguments));
            return;
        }

        const uniqueAuthors = new Set(pointsData.map(p => p.author));
        if (authorProfilePicsMap) {
            this._loadAuthorImages(uniqueAuthors, authorProfilePicsMap);
        }

        const geojson = { type: "FeatureCollection", features: pointsData.map((point, i) => ({
            type: "Feature", geometry: { type: "Point", coordinates: [twoDimCoords[i][0], twoDimCoords[i][1]] },
            properties: { 
                text: point.content, 
                author: point.author,
                timestamp: point.timestamp,
                likes: point.likes || 0,
                url: point.url,
                cluster_label: labels[i],
                profile_pic: point.profilePic // Pass explicit profile pic url for popups
            }
        }))};
        this.map.getSource('points').setData(geojson);
        
        // Remove layers to refresh order if needed, but here we just ensure they exist
        if (this.map.getLayer('points-circles')) this.map.removeLayer('points-circles');
        if (this.map.getLayer('points-icons')) this.map.removeLayer('points-icons');
        
        // LOGIC:
        // Base radius logic remains.
        // Requested: "Make profile picture just 10% larger".
        // Requested: "Make cluster color ring twice as thick".
        // Old ring ~2px. New ring ~4px.
        // Old logic: Radius = X. Icon Scale = (X - 2) / 32.
        // New logic: 
        // 1. Scale up the base Radius by 10% to make the whole point larger.
        // 2. Adjust the Icon Scale subtraction to create a 4px gap (ring) instead of 2px.

        const baseRadius = ['+', 6, ['*', 3, ['log10', ['+', 1, ['coalesce', ['get', 'likes'], 0]]]]];
        
        // Scale radius up by 1.15 (15%) to accommodate larger image + thicker ring
        const radiusExpression = ['*', baseRadius, 1.15]; 

        // 1. The colored ring (Background Circle)
        this.map.addLayer({
            id: 'points-circles', type: 'circle', source: 'points',
            layout: { 'circle-sort-key': ['coalesce', ['get', 'likes'], 0] },
            paint: {
                'circle-radius': radiusExpression,
                'circle-color': this._generateColorScale(labels),
                'circle-opacity': 1,
            }
        }, 'point-labels');

        // 2. The Profile Picture (Symbol Layer)
        // Image texture size is 64px.
        // Target Radius = Circle Radius - 4px (for the thicker ring).
        // Scale = (Radius - 4) * 2 / 64 = (Radius - 4) / 32.
        const iconSizeExpression = ['max', 0, ['/', ['-', radiusExpression, 4], 32]];

        this.map.addLayer({
            id: 'points-icons', type: 'symbol', source: 'points',
            layout: {
                'icon-image': ['get', 'author'],
                'icon-size': iconSizeExpression,
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
                'symbol-sort-key': ['coalesce', ['get', 'likes'], 0]
            },
            paint: {
                'icon-opacity': 1
            }
        }, 'point-labels'); // Place below labels but above circles
        
        if (this.map.getLayer('point-labels')) {
            this.map.setLayoutProperty('point-labels', 'visibility', areLabelsVisible ? 'visible' : 'none');
        }
        
        if (customizations && labelToCustIdMap) {
            this._updateClusterNameLayer(twoDimCoords, labels, customizations, labelToCustIdMap);
        } else {
            const source = this.map.getSource('cluster-names');
            if (source) source.setData({ type: 'FeatureCollection', features: [] });
        }

        if (shouldFitBounds) {
            const bounds = new maplibregl.LngLatBounds();
            twoDimCoords.forEach(coord => bounds.extend(coord));
            
            this.map.resize();
            if (!bounds.isEmpty()) {
                this.map.fitBounds(bounds, { padding: 50, maxZoom: 8, duration: 1000 }); // Added duration
            }
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

    focusOnLocation(coords) {
        if (!this.map.isStyleLoaded() || !coords) return;
        this.map.flyTo({ 
            center: [coords[0], coords[1]], 
            zoom: 6.5, 
            speed: 2.5,
            curve: 1,
            essential: true 
        });
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
        
        this.map.flyTo({ 
            center: coords, 
            zoom: 6.5,
            speed: 2.5,
            curve: 1,
            essential: true 
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