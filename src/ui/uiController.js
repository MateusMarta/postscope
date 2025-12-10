function debounce(func, delay) { let timeout; return function (...args) { const context = this; clearTimeout(timeout); timeout = setTimeout(() => func.apply(context, args), delay); }; }
const truncate = (str, maxLength) => { if (!str || str.length <= maxLength) return str; return str.substring(0, maxLength) + '...'; };
import { profilePicCache } from '../services/ProfilePicCache.js';

export class UIController {
    constructor({ onRecluster, onQuery, onNameChange, onVisibilityChange, onToggleLabels, onTitleChange, getMapInstance, onPostSelect, onTimeRangeChange, onFocusQuery }) {
        this.callbacks = { onRecluster, onQuery, onNameChange, onVisibilityChange, onToggleLabels, onTitleChange, onPostSelect, onTimeRangeChange, onFocusQuery };

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
        this.verticalResizer = document.getElementById('vertical-resizer');
        this.queryContainer = document.getElementById('query-container');
        this.focusQueryBtn = document.getElementById('focus-query-btn');

        // New Timeline Elements
        this.timelineControls = document.getElementById('timeline-controls');
        this.timelineBrushContainer = document.getElementById('timeline-brush-container');
        this.timelineWindow = document.getElementById('timeline-window');
        this.timelineHistogram = document.getElementById('timeline-histogram');
        this.timelineDimmerLeft = document.getElementById('timeline-dimmer-left');
        this.timelineDimmerRight = document.getElementById('timeline-dimmer-right');
        this.timelineStartLabel = document.getElementById('timeline-start-label');
        this.timelineEndLabel = document.getElementById('timeline-end-label');

        // State for timeline dragging
        this.isDragging = false;
        this.dragMode = null; // 'move', 'resize-left', 'resize-right'
        this.dragStartX = 0;
        this.dragStartLeft = 0; // percentage
        this.dragStartRight = 0; // percentage
        this.globalMinTime = 0;
        this.globalMaxTime = 0;
        this.currentLeftPercent = 0;
        this.currentRightPercent = 100;

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
        this.minClusterSizeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.callbacks.onRecluster(); } });

        // Updated Query Input Listener
        this.queryInput.addEventListener('input', debounce((e) => {
            const val = e.target.value.trim();
            this.callbacks.onQuery(val);
            this._updateFocusButtonState(val.length > 0);
        }, 300));

        // New Focus Button Listener
        this.focusQueryBtn.addEventListener('click', () => {
            if (this.callbacks.onFocusQuery) this.callbacks.onFocusQuery();
        });

        // --- Custom Timeline Interaction Logic ---
        if (this.timelineBrushContainer) {
            this.timelineBrushContainer.addEventListener('mousedown', this._onTimelineMouseDown.bind(this));
            document.addEventListener('mousemove', this._onTimelineMouseMove.bind(this));
            document.addEventListener('mouseup', this._onTimelineMouseUp.bind(this));
        }

        this.responseListContainer.addEventListener('click', (e) => {
            // ... (same list logic) ...
            const responseItem = e.target.closest('.response-item');
            if (!responseItem || !responseItem.dataset.originalIndex) return;

            const index = parseInt(responseItem.dataset.originalIndex, 10);
            const isAlreadyActive = responseItem.classList.contains('active');
            const currentActive = this.responseListContainer.querySelector('.response-item.active');
            if (currentActive) currentActive.classList.remove('active');

            if (isAlreadyActive) {
                if (this.callbacks.onPostSelect) this.callbacks.onPostSelect(null);
            } else {
                responseItem.classList.add('active');
                if (this.callbacks.onPostSelect) this.callbacks.onPostSelect(index);
            }
        });

        // ... (Vertical resizer logic same) ...
        if (this.verticalResizer && this.queryContainer && this.controlsPanel) {
            this.verticalResizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const startY = e.clientY;
                const startHeight = this.queryContainer.offsetHeight;
                const panel = this.controlsPanel;
                const doDrag = (moveEvent) => {
                    moveEvent.preventDefault();
                    let newHeight = startHeight - (moveEvent.clientY - startY);
                    const minHeight = 80;
                    const maxHeight = panel.offsetHeight * 0.7;
                    newHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));
                    this.queryContainer.style.height = `${newHeight}px`;
                };
                const stopDrag = () => {
                    document.body.style.cursor = 'auto'; document.body.style.userSelect = 'auto';
                    document.removeEventListener('mousemove', doDrag); document.removeEventListener('mouseup', stopDrag);
                };
                document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none';
                document.addEventListener('mousemove', doDrag); document.addEventListener('mouseup', stopDrag);
            });
        }
    }

    _updateFocusButtonState(hasText) {
        if (hasText) {
            this.focusQueryBtn.classList.remove('opacity-0', 'pointer-events-none');
            this.focusQueryBtn.classList.add('opacity-100', 'pointer-events-auto');
        } else {
            this.focusQueryBtn.classList.remove('opacity-100', 'pointer-events-auto');
            this.focusQueryBtn.classList.add('opacity-0', 'pointer-events-none');
        }
    }

    // --- Timeline Event Handlers ---

    _onTimelineMouseDown(e) {
        // Determine what was clicked: handle-left, handle-right, or the window (body)
        const target = e.target;
        const rect = this.timelineBrushContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const clickPercent = (clickX / width) * 100;

        this.isDragging = true;
        this.dragStartX = e.clientX;

        // Snap current visual state to dragging variables
        this.dragStartLeft = this.currentLeftPercent;
        this.dragStartRight = this.currentRightPercent;

        if (target.closest('.handle-left')) {
            this.dragMode = 'resize-left';
        } else if (target.closest('.handle-right')) {
            this.dragMode = 'resize-right';
        } else if (target.closest('#timeline-window')) {
            this.dragMode = 'move';
        } else {
            // Clicked outside window: Jump window center to here
            this.dragMode = 'move';
            const currentWidth = this.currentRightPercent - this.currentLeftPercent;
            const newLeft = Math.max(0, clickPercent - (currentWidth / 2));
            const newRight = Math.min(100, newLeft + currentWidth);
            // Adjust left if right hit wall
            const finalLeft = Math.max(0, newRight - currentWidth);

            this.currentLeftPercent = finalLeft;
            this.currentRightPercent = newRight;
            this.dragStartLeft = finalLeft;
            this.dragStartRight = newRight;

            this._updateTimelineVisuals();
            this._emitTimeRangeChange();
        }

        e.preventDefault(); // Prevent text selection
    }

    _onTimelineMouseMove(e) {
        if (!this.isDragging) return;

        const rect = this.timelineBrushContainer.getBoundingClientRect();
        const deltaX = e.clientX - this.dragStartX;
        const deltaPercent = (deltaX / rect.width) * 100;

        let newLeft = this.dragStartLeft;
        let newRight = this.dragStartRight;

        if (this.dragMode === 'move') {
            const width = this.dragStartRight - this.dragStartLeft;
            newLeft = Math.max(0, Math.min(100 - width, this.dragStartLeft + deltaPercent));
            newRight = newLeft + width;
        } else if (this.dragMode === 'resize-left') {
            newLeft = Math.max(0, Math.min(this.dragStartRight - 2, this.dragStartLeft + deltaPercent)); // Min width 2%
        } else if (this.dragMode === 'resize-right') {
            newRight = Math.min(100, Math.max(this.dragStartLeft + 2, this.dragStartRight + deltaPercent));
        }

        this.currentLeftPercent = newLeft;
        this.currentRightPercent = newRight;

        this._updateTimelineVisuals();
        // Debounced callback is better for performance during drag
        this._debouncedTimeEmit();
    }

    _onTimelineMouseUp(e) {
        if (!this.isDragging) return;
        this.isDragging = false;
        this._emitTimeRangeChange(); // Ensure final state is saved/rendered
    }

    // Create the debouncer locally for the class instance
    _debouncedTimeEmit = debounce(() => this._emitTimeRangeChange(), 50);

    _emitTimeRangeChange() {
        if (!this.callbacks.onTimeRangeChange) return;

        const range = this.globalMaxTime - this.globalMinTime;
        const start = this.globalMinTime + (range * (this.currentLeftPercent / 100));
        const end = this.globalMinTime + (range * (this.currentRightPercent / 100));

        this.callbacks.onTimeRangeChange(start, end);
    }

    _updateTimelineVisuals() {
        if (!this.timelineWindow) return;

        // Update the window position
        this.timelineWindow.style.left = `${this.currentLeftPercent}%`;
        this.timelineWindow.style.width = `${this.currentRightPercent - this.currentLeftPercent}%`;

        // Update dimmers
        this.timelineDimmerLeft.style.width = `${this.currentLeftPercent}%`;
        this.timelineDimmerRight.style.width = `${100 - this.currentRightPercent}%`;

        // Update labels
        const range = this.globalMaxTime - this.globalMinTime;
        const startTime = this.globalMinTime + (range * (this.currentLeftPercent / 100));
        const endTime = this.globalMinTime + (range * (this.currentRightPercent / 100));

        this.timelineStartLabel.textContent = this._formatDate(startTime);
        this.timelineEndLabel.textContent = this._formatDate(endTime);
    }

    _renderHistogram(counts) {
        if (!this.timelineHistogram) return;
        const canvas = this.timelineHistogram;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        const w = canvas.width;
        const h = canvas.height;
        const max = Math.max(...counts, 1);
        const barWidth = w / counts.length;

        ctx.clearRect(0, 0, w, h);
        const isDark = document.documentElement.classList.contains('dark');
        // Use a solid color, the opacity is handled by the canvas CSS class (0.4)
        ctx.fillStyle = isDark ? '#38bdf8' : '#0ea5e9'; // sky-400 : sky-500

        counts.forEach((count, i) => {
            const barH = (count / max) * h;
            const x = i * barWidth;
            const y = h - barH;
            ctx.fillRect(x, y, Math.max(barWidth - 1, 1), barH);
        });
    }

    _formatDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    initializeTimeline(appState) {
        const { globalMin, globalMax, currentStart, currentEnd } = appState.getTimeRange();
        this.globalMinTime = globalMin;
        this.globalMaxTime = globalMax;

        if (globalMax <= globalMin) {
            this.timelineControls.classList.add('hidden');
            return;
        }

        this.timelineControls.classList.remove('hidden');

        // Convert timestamps to percentages
        const range = globalMax - globalMin;
        this.currentLeftPercent = ((currentStart - globalMin) / range) * 100;
        this.currentRightPercent = ((currentEnd - globalMin) / range) * 100;

        // Clamp
        this.currentLeftPercent = Math.max(0, Math.min(100, this.currentLeftPercent));
        this.currentRightPercent = Math.max(0, Math.min(100, this.currentRightPercent));

        this._updateTimelineVisuals();

        const histogramData = appState.getHistogramData(100); // 100 bins for smoother look

        if (this.timelineHistogram.clientWidth > 0) {
            this._renderHistogram(histogramData);
        } else {
            requestAnimationFrame(() => this._renderHistogram(histogramData));
        }

        window.addEventListener('themechange', () => this._renderHistogram(histogramData));
        window.addEventListener('resize', debounce(() => this._renderHistogram(histogramData), 200));
    }

    _attachMapEventListeners(map) {
        map.on('click', (e) => {
            const features = map.queryRenderedFeatures(e.point, { layers: ['points-circles'] });
            if (features.length > 0) return;
            this._deselectCluster();
        });
    }

    showLoading(message) { this.statusArea.innerHTML = `<div class="info-banner">${message}</div>`; }
    hideLoading(message) { this.statusArea.innerHTML = `<div class="info-banner">${message}</div>`; }
    showError(message) { this.statusArea.innerHTML = `<div class="error-container"><p>${message}</p></div>`; this.disableControls(); this.reclusterButton.style.display = 'none'; }
    showVersionWarning() { if (!this.versionNotificationArea) return; this.versionNotificationArea.innerHTML = `<div class="version-warning-banner"><div><p class="font-semibold">Your bookmarklet is out of date.</p><p class="mt-1">For the best experience and new features, please get the latest version from the <a href="index.html" target="_blank" rel="noopener noreferrer">Postscope homepage</a>.</p></div></div>`; }
    disableControls() { this.reclusterButton.disabled = true; this.minClusterSizeEl.disabled = true; this.queryInput.disabled = true; }
    enableControls() { this.reclusterButton.disabled = false; this.minClusterSizeEl.disabled = false; this.queryInput.disabled = false; this.reclusterButton.style.display = 'block'; }
    getMinClusterSize = () => parseInt(this.minClusterSizeEl.value, 10);
    setMinClusterSize = (size) => this.minClusterSizeEl.value = size;
    updateToggleLabelsButton = (isVisible) => this.toggleLabelsButton.textContent = isVisible ? 'Hide Text' : 'Show Text';
    setVisualizationTitle(name) {
        if (!this.titleAreaEl) return;
        this.titleAreaEl.innerHTML = '';
        const titleEl = document.createElement('h2'); titleEl.className = 'text-xl font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2';
        const textSpan = document.createElement('span'); textSpan.textContent = name; textSpan.className = 'flex-1';
        const editButton = document.createElement('button'); editButton.title = 'Edit name'; editButton.className = 'title-edit-btn'; editButton.innerHTML = `<span class="material-symbols-outlined">edit</span>`;
        editButton.addEventListener('click', (e) => {
            e.preventDefault(); const currentName = textSpan.textContent; const input = document.createElement('input');
            input.type = 'text'; input.value = currentName; input.className = 'text-xl font-semibold text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 border border-sky-500 rounded-lg px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-sky-500';
            const save = () => { const newName = input.value.trim(); if (newName && newName !== currentName) { this.callbacks.onTitleChange(newName); textSpan.textContent = newName; } titleEl.replaceChild(textSpan, input); titleEl.appendChild(editButton); };
            input.addEventListener('blur', save); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = currentName; input.blur(); } });
            titleEl.replaceChild(input, textSpan); titleEl.removeChild(editButton); input.focus(); input.select();
        });
        titleEl.append(textSpan, editButton); this.titleAreaEl.appendChild(titleEl);
    }
    setSourceInfo(context, postCount) {
        if (!context || !postCount) { this.sourceInfoEl.style.display = 'none'; return; }
        let html = ''; const nameText = context.name ? `<b>${truncate(context.name, 100)}</b>` : '';
        switch (context.type) {
            case 'post': html = `<p>Visualizing <b>${postCount}</b> replies for post by <b>@${truncate(context.author, 30)}</b>:</p><blockquote>${truncate(context.text, 150)}</blockquote>`; break;
            case 'profile': html = `<p>Visualizing <b>${postCount}</b> posts from profile: <b>@${truncate(context.author, 30)} (${context.subpage || 'tweets'})</b></p>`; break;
            case 'home': html = `<p>Visualizing <b>${postCount}</b> posts from your <b>Home Timeline</b></p>`; break;
            case 'explore': html = `<p>Visualizing <b>${postCount}</b> posts from <b>Explore</b></p>`; break;
            case 'bookmarks': html = `<p>Visualizing <b>${postCount}</b> posts from your <b>Bookmarks</b></p>`; break;
            case 'list': html = `<p>Visualizing <b>${postCount}</b> posts from the List: ${nameText || '<i>Unknown List</i>'}</p>`; break;
            case 'communities': html = `<p>Visualizing <b>${postCount}</b> posts from the Community: ${nameText || '<i>Unknown Community</i>'}</p>`; break;
            case 'profile_communities': html = `<p>Visualizing <b>${postCount}</b> posts from communities for <b>@${truncate(context.author, 30)}</b></p>`; break;
            case 'profile_communities_explore': html = `<p>Visualizing <b>${postCount}</b> posts from explored communities for <b>@${truncate(context.author, 30)}</b></p>`; break;
            case 'search':
                const filterMap = { live: 'Latest', user: 'People', image: 'Media' }; let filterName = 'Top'; if (context.filter) { filterName = filterMap[context.filter] || context.filter; }
                const filterText = ` on the <b>${filterName}</b> tab`; html = `<p>Visualizing <b>${postCount}</b> posts from search${filterText}:</p><blockquote>${truncate(context.query, 150)}</blockquote>`; break;
            default: html = `<p>Visualizing <b>${postCount}</b> posts.</p>`; break;
        }
        this.sourceInfoEl.innerHTML = html; this.sourceInfoEl.style.display = 'block';
    }
    render(appState, visualizer, shouldFitBounds = false) {
        const { items, coords, labels } = appState.getFilteredData();
        const customizations = appState.getCustomizationsForCurrentSize();
        const labelToCustIdMap = appState.getLabelToCustIdMap();

        visualizer.render(items, coords, labels, customizations, labelToCustIdMap, appState.getArePointLabelsVisible(), shouldFitBounds);
        this._renderClusterUI(items, labels, customizations, labelToCustIdMap, appState);
    }
    _renderClusterUI(items, labels, customizations, labelToCustIdMap, appState) {
        const previouslyActiveLabel = this.clusterListContainer.querySelector('.cluster-item.active')?.dataset.label;
        this.clusterListContainer.innerHTML = '';
        if (previouslyActiveLabel === undefined) this._deselectCluster();
        const clusters = {};
        items.forEach((item, i) => {
            const label = labels[i]; if (!clusters[label]) clusters[label] = [];
            const globalIndex = appState.getAllItems().indexOf(item);
            clusters[label].push({ ...item, globalIndex: globalIndex });
        });
        const sortedNumericLabels = Object.keys(clusters).map(l => parseInt(l, 10)).sort((a, b) => { if (a === -1) return 1; if (b === -1) return -1; return a - b; });
        const uniqueClusterLabels = sortedNumericLabels.filter(l => l !== -1);
        const isDark = document.documentElement.classList.contains('dark');
        const getColorForCluster = (label) => {
            if (label == -1) return isDark ? '#475569' : '#d1d5db';
            const clusterIndex = uniqueClusterLabels.indexOf(label);
            const hue = (clusterIndex * (360 / (uniqueClusterLabels.length + 1))) % 360;
            const saturation = isDark ? 70 : 80; const lightness = isDark ? 60 : 50;
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        };
        const eyeIcon = `<span class="material-symbols-outlined">visibility</span>`;
        const eyeOffIcon = `<span class="material-symbols-outlined">visibility_off</span>`;
        for (const label of sortedNumericLabels) {
            const clusterItems = clusters[label]; const isRealCluster = label !== -1;
            const clusterItemEl = document.createElement('div'); clusterItemEl.className = 'cluster-item'; clusterItemEl.dataset.label = label;
            if (!isRealCluster) clusterItemEl.classList.add('cluster-others');
            const swatch = document.createElement('div'); swatch.className = 'legend-color-swatch'; swatch.style.backgroundColor = getColorForCluster(label);
            if (isRealCluster) {
                appState._ensureCustomizationExists(label);
                const custId = labelToCustIdMap.get(label); const currentCustomization = customizations.get(custId);
                const nameInput = document.createElement('input'); nameInput.type = 'text';
                const defaultName = `Cluster ${uniqueClusterLabels.indexOf(label) + 1}`;
                nameInput.value = (currentCustomization && currentCustomization.name) ? currentCustomization.name : defaultName; nameInput.placeholder = defaultName;
                nameInput.addEventListener('input', debounce((e) => this.callbacks.onNameChange(label, e.target.value), 500)); nameInput.addEventListener('click', e => e.stopPropagation());
                nameInput.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); });
                const visibilityToggle = document.createElement('button'); visibilityToggle.type = 'button';
                const isVisible = !!(currentCustomization && currentCustomization.visible);
                visibilityToggle.className = `cluster-visibility-toggle ${isVisible ? 'visible' : ''}`; visibilityToggle.innerHTML = isVisible ? eyeIcon : eyeOffIcon;
                visibilityToggle.title = isVisible ? "Hide name on map" : "Show name on map";
                visibilityToggle.addEventListener('click', (e) => { e.stopPropagation(); this.callbacks.onVisibilityChange(label, !isVisible); });
                const countSpan = document.createElement('span'); countSpan.className = 'cluster-item-count'; countSpan.textContent = clusterItems.length;
                clusterItemEl.append(swatch, nameInput, countSpan, visibilityToggle);
            } else {
                clusterItemEl.textContent = `Others (${clusterItems.length})`; clusterItemEl.prepend(swatch);
            }
            clusterItemEl.addEventListener('click', () => this._handleClusterSelection(label, clusters)); this.clusterListContainer.appendChild(clusterItemEl);
        }
        if (previouslyActiveLabel !== undefined) {
            const activeEl = this.clusterListContainer.querySelector(`.cluster-item[data-label="${previouslyActiveLabel}"]`);
            if (activeEl) { activeEl.classList.add('active'); if (clusters[previouslyActiveLabel]) { this._handleClusterSelection(parseInt(previouslyActiveLabel, 10), clusters, true); } else { this._deselectCluster(); } }
        }
    }
    _deselectCluster() {
        const currentActive = this.clusterListContainer.querySelector('.cluster-item.active'); if (currentActive) currentActive.classList.remove('active');
        this.responseListContainer.innerHTML = ''; this.responseListContainer.style.display = 'none';
        if (this.callbacks.onPostSelect) this.callbacks.onPostSelect(null);
    }
    _handleClusterSelection(label, allClusters, isRerender = false) {
        const shouldResetScroll = !isRerender;
        if (!isRerender) { const currentActive = this.clusterListContainer.querySelector('.cluster-item.active'); if (currentActive && currentActive.dataset.label == label) { this._deselectCluster(); return; } }
        this._deselectCluster(); this.responseListContainer.style.display = 'block';
        const selectedEl = this.clusterListContainer.querySelector(`.cluster-item[data-label="${label}"]`); if (selectedEl) selectedEl.classList.add('active');
        const detailView = document.createElement('div'); detailView.className = 'cluster-detail-view';
        const clusterItems = allClusters[label]; clusterItems.sort((a, b) => (b.likes || 0) - (a.likes || 0));
        clusterItems.forEach(item => {
            const itemDiv = document.createElement('div'); itemDiv.className = 'response-item'; itemDiv.dataset.originalIndex = item.globalIndex;

            let timestampHtml = '';
            if (item.timestamp) { try { const date = new Date(item.timestamp); const formattedDate = date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); timestampHtml = `<span class="text-slate-500 dark:text-slate-400 text-xs ml-2">• ${formattedDate}</span>`; } catch (e) { console.warn("Could not parse timestamp:", item.timestamp, e); } }

            // New Layout for Sidebar List
            let avatarHtml = `<div class="response-avatar-placeholder">${item.author.charAt(0).toUpperCase()}</div>`;
            // Async load placeholder
            avatarHtml += `<img class="response-avatar" alt="${item.author}" style="display:none" />`;

            itemDiv.innerHTML = `
                <div class="response-item-inner">
                    <div class="response-avatar-container">
                        ${avatarHtml}
                    </div>
                    <div class="response-content">
                        <div class="response-header">
                            <b>@${item.author}</b> <span class="text-slate-500 dark:text-slate-400 text-xs">(❤️ ${item.likes})</span>${timestampHtml}
                        </div>
                        <div class="mt-1">${item.content}</div>
                    </div>
                </div>`;

            detailView.appendChild(itemDiv);

            // Load profile pic
            profilePicCache.getBlobUrl(item.author).then(url => {
                if (url) {
                    const img = itemDiv.querySelector('.response-avatar');
                    const placeholder = itemDiv.querySelector('.response-avatar-placeholder');
                    if (img && placeholder) {
                        img.src = url;
                        img.style.display = 'block';
                        placeholder.style.display = 'none';
                    }
                }
            });
        });
        this.responseListContainer.appendChild(detailView);
        if (shouldResetScroll) this.responseListContainer.scrollTop = 0;
    }
}