function debounce(func, delay) { let timeout; return function(...args) { const context = this; clearTimeout(timeout); timeout = setTimeout(() => func.apply(context, args), delay); }; }

// Helper function to truncate long strings
const truncate = (str, maxLength) => {
    if (!str || str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
};

export class UIController {
    constructor({ onRecluster, onQuery, onNameChange, onVisibilityChange, onToggleLabels, onTitleChange, getMapInstance }) {
        this.callbacks = { onRecluster, onQuery, onNameChange, onVisibilityChange, onToggleLabels, onTitleChange };
        
        this.minClusterSizeEl = document.getElementById('min-cluster-size');
        this.reclusterButton = document.getElementById('recluster-button');
        this.toggleLabelsButton = document.getElementById('toggle-labels-button');
        this.queryInput = document.getElementById('query-input');
        this.statusArea = document.getElementById('status-area');
        this.sourceInfoEl = document.getElementById('source-info');
        this.titleAreaEl = document.getElementById('visualization-title-area');
        this.clusterListContainer = document.getElementById('cluster-list-container');
        this.responseListContainer = document.getElementById('response-list-container');
        this.versionNotificationArea = document.getElementById('version-notification-area');
        this.controlsPanel = document.querySelector('.controls-panel');
        this.visualizationPanel = document.querySelector('.visualization-panel');

        this._attachEventListeners();
        
        const mapReadyInterval = setInterval(() => {
            const map = getMapInstance();
            if (map && map.isStyleLoaded()) {
                this._attachMapEventListeners(map);
                clearInterval(mapReadyInterval);
            }
        }, 100);
    }

    _attachEventListeners() {
        this.reclusterButton.addEventListener('click', () => this.callbacks.onRecluster());
        this.toggleLabelsButton.addEventListener('click', () => this.callbacks.onToggleLabels());
        this.queryInput.addEventListener('input', debounce((e) => this.callbacks.onQuery(e.target.value.trim()), 300));

        this.minClusterSizeEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.callbacks.onRecluster();
            }
        });
    }

    _attachMapEventListeners(map) {
        map.on('click', (e) => {
            const features = map.queryRenderedFeatures(e.point, { layers: ['points-circles'] });
            if (features.length > 0) return;
            this._deselectCluster();
        });
    }
    
    showLoading(message) {
        this.statusArea.innerHTML = `<div class="info-banner">${message}</div>`;
    }
    
    hideLoading(message) {
        this.statusArea.innerHTML = `<div class="info-banner">${message}</div>`;
    }

    showError(message) {
        this.statusArea.innerHTML = `<div class="error-container"><p>${message}</p></div>`;
        this.disableControls();
        this.reclusterButton.style.display = 'none';
    }

    showVersionWarning() {
        if (!this.versionNotificationArea) return;
        this.versionNotificationArea.innerHTML = `<div class="version-warning-banner">
            <div>
                <p class="font-semibold">Your bookmarklet is out of date.</p>
                <p class="mt-1">For the best experience and new features, please get the latest version from the <a href="index.html" target="_blank" rel="noopener noreferrer">Postscope homepage</a>.</p>
            </div>
        </div>`;
    }

    disableControls() {
        this.reclusterButton.disabled = true;
        this.minClusterSizeEl.disabled = true;
        this.queryInput.disabled = true;
    }

    enableControls() {
        this.reclusterButton.disabled = false;
        this.minClusterSizeEl.disabled = false;
        this.queryInput.disabled = false;
        this.reclusterButton.style.display = 'block';
    }
    
    getMinClusterSize = () => parseInt(this.minClusterSizeEl.value, 10);
    setMinClusterSize = (size) => this.minClusterSizeEl.value = size;
    updateToggleLabelsButton = (isVisible) => this.toggleLabelsButton.textContent = isVisible ? 'Hide Text' : 'Show Text';

    setVisualizationTitle(name) {
        if (!this.titleAreaEl) {
            console.error("UIController could not find the '#visualization-title-area' element in the DOM.");
            return;
        }

        this.titleAreaEl.innerHTML = '';
        const titleEl = document.createElement('h2');
        titleEl.className = 'text-xl font-semibold text-slate-800 flex items-center gap-2';
        
        const textSpan = document.createElement('span');
        textSpan.textContent = name;
        textSpan.className = 'flex-1';
        
        const editButton = document.createElement('button');
        editButton.title = 'Edit name';
        editButton.className = 'p-1.5 rounded-full text-slate-400 hover:bg-slate-200 hover:text-sky-600 transition-colors';
        editButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>`;

        editButton.addEventListener('click', (e) => {
            e.preventDefault();
            const currentName = textSpan.textContent;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.className = 'text-xl font-semibold text-slate-800 bg-white border border-sky-500 rounded-md px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-sky-500';

            const save = () => {
                const newName = input.value.trim();
                if (newName && newName !== currentName) {
                    this.callbacks.onTitleChange(newName);
                    textSpan.textContent = newName;
                }
                titleEl.replaceChild(textSpan, input);
                titleEl.appendChild(editButton);
            };
            
            input.addEventListener('blur', save);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') input.blur();
                if (e.key === 'Escape') {
                    input.value = currentName;
                    input.blur();
                }
            });

            titleEl.replaceChild(input, textSpan);
            titleEl.removeChild(editButton);
            input.focus();
            input.select();
        });

        titleEl.append(textSpan, editButton);
        this.titleAreaEl.appendChild(titleEl);
    }

    setSourceInfo(context, postCount) {
        if (!context || !postCount) {
            this.sourceInfoEl.style.display = 'none';
            return;
        }

        let html = '';
        const nameText = context.name ? `<b>${truncate(context.name, 100)}</b>` : '';

        switch (context.type) {
            case 'post':
                html = `<p>Visualizing <b>${postCount}</b> replies for post by <b>@${truncate(context.author, 30)}</b>:</p><blockquote>${truncate(context.text, 150)}</blockquote>`;
                break;
            case 'profile':
                html = `<p>Visualizing <b>${postCount}</b> posts from profile: <b>@${truncate(context.author, 30)} (${context.subpage || 'tweets'})</b></p>`;
                break;
            case 'home':
                html = `<p>Visualizing <b>${postCount}</b> posts from your <b>Home Timeline</b></p>`;
                break;
            case 'explore':
                html = `<p>Visualizing <b>${postCount}</b> posts from <b>Explore</b></p>`;
                break;
            case 'bookmarks':
                html = `<p>Visualizing <b>${postCount}</b> posts from your <b>Bookmarks</b></p>`;
                break;
            case 'list':
                html = `<p>Visualizing <b>${postCount}</b> posts from the List: ${nameText || '<i>Unknown List</i>'}</p>`;
                break;
            case 'communities':
                html = `<p>Visualizing <b>${postCount}</b> posts from the Community: ${nameText || '<i>Unknown Community</i>'}</p>`;
                break;
            case 'profile_communities':
                html = `<p>Visualizing <b>${postCount}</b> posts from communities for <b>@${truncate(context.author, 30)}</b></p>`;
                break;
            case 'profile_communities_explore':
                html = `<p>Visualizing <b>${postCount}</b> posts from explored communities for <b>@${truncate(context.author, 30)}</b></p>`;
                break;
            case 'search':
                const filterMap = { live: 'Latest', user: 'People', image: 'Media' };
                let filterName = 'Top';
                if (context.filter) { filterName = filterMap[context.filter] || context.filter; }
                const filterText = ` on the <b>${filterName}</b> tab`;
                html = `<p>Visualizing <b>${postCount}</b> posts from search${filterText}:</p><blockquote>${truncate(context.query, 150)}</blockquote>`;
                break;
            default:
                html = `<p>Visualizing <b>${postCount}</b> posts.</p>`;
                break;
        }
        this.sourceInfoEl.innerHTML = html;
        this.sourceInfoEl.style.display = 'block';
    }

    render(appState, visualizer) {
        const items = appState.getAllItems();
        const coords = appState.getData2D();
        const labels = appState.getLabels();
        const customizations = appState.getCustomizationsForCurrentSize();
        const labelToCustIdMap = appState.getLabelToCustIdMap();
        
        visualizer.render(items, coords, labels, customizations, labelToCustIdMap, appState.getArePointLabelsVisible());
        this._renderClusterUI(appState);
    }

    _renderClusterUI(appState) {
        const previouslyActiveLabel = this.clusterListContainer.querySelector('.cluster-item.active')?.dataset.label;

        this.clusterListContainer.innerHTML = '';
        if (previouslyActiveLabel === undefined) {
            this._deselectCluster();
        }

        const items = appState.getAllItems();
        const labels = appState.getLabels();
        const customizations = appState.getCustomizationsForCurrentSize();
        const labelToCustIdMap = appState.getLabelToCustIdMap();

        const clusters = {};
        items.forEach((item, i) => { const label = labels[i]; if (!clusters[label]) clusters[label] = []; clusters[label].push(item); });
        
        const sortedNumericLabels = Object.keys(clusters).map(l => parseInt(l, 10)).sort((a, b) => { if (a === -1) return 1; if (b === -1) return -1; return a - b; });
        const uniqueClusterLabels = sortedNumericLabels.filter(l => l !== -1);
        
        const getColorForCluster = (label) => { if (label == -1) return '#cccccc'; const clusterIndex = uniqueClusterLabels.indexOf(label); const hue = (clusterIndex * (360 / (uniqueClusterLabels.length + 1))) % 360; return `hsl(${hue}, 80%, 50%)`; };
        
        const eyeIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
        const eyeOffIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-4 .68l2.21 2.21C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L21.73 23 23 21.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zM12 17c.95 0 1.82-.22 2.6-.6L13 14.82c-.17.02-.34.03-.5.03-1.66 0-3-1.34-3-3 0-.17.01-.33.03-.5L8.4 9.4C7.78 10.18 7.5 11.05 7.5 12c0 2.48 2.02 4.5 4.5 4.5z"/></svg>`;

        for (const label of sortedNumericLabels) {
            const clusterItems = clusters[label];
            const isRealCluster = label !== -1;
            
            const clusterItemEl = document.createElement('div');
            clusterItemEl.className = 'cluster-item';
            clusterItemEl.dataset.label = label;
            if (!isRealCluster) clusterItemEl.classList.add('cluster-others');

            const swatch = document.createElement('div');
            swatch.className = 'legend-color-swatch';
            swatch.style.backgroundColor = getColorForCluster(label);
            
            if (isRealCluster) {
                appState._ensureCustomizationExists(label);
                const custId = labelToCustIdMap.get(label);
                const currentCustomization = customizations.get(custId);

                const nameInput = document.createElement('input');
                nameInput.type = 'text';
                const defaultName = `Cluster ${uniqueClusterLabels.indexOf(label) + 1}`;
                nameInput.value = (currentCustomization && currentCustomization.name) ? currentCustomization.name : defaultName;
                nameInput.placeholder = defaultName;
                nameInput.addEventListener('input', debounce((e) => this.callbacks.onNameChange(label, e.target.value), 500));
                nameInput.addEventListener('click', e => e.stopPropagation());
                
                nameInput.addEventListener('keydown', e => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                        e.target.blur();
                    }
                });

                const visibilityToggle = document.createElement('button');
                visibilityToggle.type = 'button';
                const isVisible = !!(currentCustomization && currentCustomization.visible);
                visibilityToggle.className = `cluster-visibility-toggle ${isVisible ? 'visible' : ''}`;
                visibilityToggle.innerHTML = isVisible ? eyeIcon : eyeOffIcon;
                visibilityToggle.title = isVisible ? "Hide name on map" : "Show name on map";
                visibilityToggle.addEventListener('click', (e) => { e.stopPropagation(); this.callbacks.onVisibilityChange(label, !isVisible); });

                const countSpan = document.createElement('span');
                countSpan.className = 'cluster-item-count';
                countSpan.textContent = clusterItems.length;

                clusterItemEl.append(swatch, nameInput, countSpan, visibilityToggle);
            } else {
                clusterItemEl.textContent = `Others (${clusterItems.length})`;
                clusterItemEl.prepend(swatch);
            }
            
            clusterItemEl.addEventListener('click', () => this._handleClusterSelection(label, clusters));
            this.clusterListContainer.appendChild(clusterItemEl);
        }
        
        if (previouslyActiveLabel !== undefined) {
             const activeEl = this.clusterListContainer.querySelector(`.cluster-item[data-label="${previouslyActiveLabel}"]`);
             if (activeEl) {
                 activeEl.classList.add('active');
                 if (clusters[previouslyActiveLabel]) {
                     this._handleClusterSelection(parseInt(previouslyActiveLabel, 10), clusters, true);
                 } else {
                     this._deselectCluster();
                 }
             }
        }
    }

    _deselectCluster() {
        const currentActive = this.clusterListContainer.querySelector('.cluster-item.active');
        if (currentActive) {
            currentActive.classList.remove('active');
        }
        this.responseListContainer.innerHTML = '';
        this.responseListContainer.style.display = 'none';
    }

    _handleClusterSelection(label, allClusters, isRerender = false) {
        if (!isRerender) {
            const currentActive = this.clusterListContainer.querySelector('.cluster-item.active');
            if(currentActive && currentActive.dataset.label == label) {
                this._deselectCluster();
                return;
            }
        }
        
        this._deselectCluster();
        this.responseListContainer.style.display = 'block';

        const selectedEl = this.clusterListContainer.querySelector(`.cluster-item[data-label="${label}"]`);
        if (selectedEl) selectedEl.classList.add('active');

        const detailView = document.createElement('div');
        detailView.className = 'cluster-detail-view';
        
        const clusterItems = allClusters[label];
        clusterItems.sort((a, b) => (b.likes || 0) - (a.likes || 0));
        clusterItems.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'response-item';
            
            let timestampHtml = '';
            if (item.timestamp) {
                try {
                    const date = new Date(item.timestamp);
                    const formattedDate = date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                    timestampHtml = `<span class="text-slate-500 text-xs ml-2">• ${formattedDate}</span>`;
                } catch (e) {
                    console.warn("Could not parse timestamp:", item.timestamp, e);
                }
            }

            itemDiv.innerHTML = `<div><b>@${item.author}</b> <span class="text-slate-500 text-xs">(❤️ ${item.likes})</span>${timestampHtml}</div><div class="mt-1">${item.content}</div>`;
            detailView.appendChild(itemDiv);
        });
        
        this.responseListContainer.appendChild(detailView);
    }
}