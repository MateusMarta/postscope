import { vizStore } from './services/visualizationStore.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- STATE ---
    let fullHistoryList = [];
    let currentPage = 1;
    const ITEMS_PER_PAGE = 5;

    // --- DOM ELEMENTS ---
    const historyList = document.getElementById('history-list');
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    const toggleBtn = document.getElementById('toggle-instructions-btn');
    const instructionsContent = document.getElementById('instructions-content');
    const exportBtn = document.getElementById('export-history-btn');
    const fileInput = document.getElementById('import-file-input');
    const historyItemTemplate = document.getElementById('history-item-template');
    const dragOverlay = document.getElementById('drag-overlay');
    const prevContainer = document.getElementById('pagination-prev-container');
    const pagesContainer = document.getElementById('pagination-pages-container');
    const nextContainer = document.getElementById('pagination-next-container');
    const searchContainer = document.getElementById('search-container');
    const searchInput = document.getElementById('search-history-input');
    const appUrl = new URL('viewer.html', window.location.href).href;

    // --- RENDER FUNCTIONS ---
    
    function renderItemList(items, page) {
        historyList.innerHTML = '';
        
        if (items.length === 0) {
            const isSearching = searchInput.value.trim().length > 0;
            const message = isSearching 
                ? '<p>No visualizations match your search.</p>'
                : '<p>No history yet.</p><p>Use the bookmarklet or import a file to get started.</p>';
            historyList.innerHTML = `<div class="text-center text-slate-500 dark:text-slate-400 py-8 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">${message}</div>`;
            return;
        }

        const paginatedItems = items.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
        paginatedItems.forEach(item => {
            const templateClone = historyItemTemplate.content.cloneNode(true);
            const li = templateClone.querySelector('.history-item');
            
            li.dataset.id = item.id;
            
            const title = item.name || 'Untitled Visualization';
            const date = new Date(item.timestamp).toLocaleString();
            
            const mainLink = li.querySelector('.history-item-main');
            // Link is always valid now. If savedState missing, main.js will resume analysis.
            mainLink.href = `${appUrl}#${item.id}`;
            
            const h3 = li.querySelector('h3');
            
            if (!item.hasSavedState) {
                // Visual cue that it's incomplete
                const badge = document.createElement('span');
                badge.className = "inline-block bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded ml-2 border border-amber-200 align-middle font-normal";
                badge.textContent = "Processing Incomplete";
                h3.appendChild(badge);
                mainLink.title = "Analysis incomplete. Click to resume.";
            }

            h3.prepend(document.createTextNode(title));
            li.querySelector('p').textContent = `${item.postCount} posts • Created ${date}`;
            historyList.appendChild(li);
        });
    }

    /**
     * Creates an array of page numbers and ellipses to display.
     */
    function getPaginationItems(currentPage, totalPages, maxVisible) {
        if (totalPages <= maxVisible) {
            return Array.from({ length: totalPages }, (_, i) => i + 1);
        }
        if (maxVisible % 2 === 0) maxVisible--;
        
        const sideWidth = Math.floor((maxVisible - 3) / 2);
        const windowStart = currentPage - sideWidth;

        if (currentPage - 1 <= sideWidth + 1) {
            const front = Array.from({ length: maxVisible - 2 }, (_, i) => i + 1);
            return [...front, '...', totalPages];
        }
        if (totalPages - currentPage <= sideWidth + 1) {
            const back = Array.from({ length: maxVisible - 2 }, (_, i) => totalPages - (maxVisible - 3) + i);
            return [1, '...', ...back];
        }
        const middle = Array.from({ length: maxVisible - 4 }, (_, i) => windowStart + i);
        return [1, '...', ...middle, '...', totalPages];
    }

    function renderPagination(totalItems) {
        prevContainer.innerHTML = '';
        pagesContainer.innerHTML = '';
        nextContainer.innerHTML = '';
        
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        if (totalPages <= 1) return;

        const createButton = (text, page, isDisabled = false, isActive = false) => {
            const btn = document.createElement('button');
            btn.innerHTML = text;
            btn.disabled = isDisabled;
            const baseClasses = "px-3 py-1.5 border rounded-md text-sm font-medium transition-colors";
            const activeClasses = "bg-sky-600 border-sky-600 text-white";
            const defaultClasses = "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700";
            const disabledClasses = "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed border-slate-200 dark:border-slate-700";

            btn.className = `${baseClasses} ${isDisabled ? disabledClasses : (isActive ? activeClasses : defaultClasses)}`;
            if (!isDisabled) {
                btn.addEventListener('click', () => { currentPage = page; refreshDisplay(); });
            }
            return btn;
        };
        
        const createEllipsis = () => {
            const span = document.createElement('span');
            span.className = 'px-1.5 py-1.5 text-slate-500 dark:text-slate-400 flex items-center justify-center';
            span.textContent = '...';
            return span;
        };

        prevContainer.appendChild(createButton('« Prev', currentPage - 1, currentPage === 1));
        nextContainer.appendChild(createButton('Next »', currentPage + 1, currentPage === totalPages));

        const containerWidth = pagesContainer.clientWidth;
        const avgButtonWidth = 48;
        let capacity = Math.max(3, Math.floor(containerWidth / avgButtonWidth));
        
        const itemsToRender = getPaginationItems(currentPage, totalPages, capacity);
        
        itemsToRender.forEach(item => {
            if (typeof item === 'number') {
                pagesContainer.appendChild(createButton(item, item, false, item === currentPage));
            } else {
                pagesContainer.appendChild(createEllipsis());
            }
        });
    }

    function updateControlsVisibility() {
        const hasHistory = fullHistoryList.length > 0;
        searchContainer.style.display = hasHistory ? 'block' : 'none';
        exportBtn.style.display = hasHistory ? 'inline-flex' : 'none';
        clearHistoryBtn.style.display = hasHistory ? 'inline-flex' : 'none';
        
        if (!hasHistory) {
            instructionsContent.style.display = 'block';
            toggleBtn.style.display = 'none';
        } else {
            toggleBtn.style.display = 'flex';
        }
    }

    function refreshDisplay() {
        updateControlsVisibility();
        
        const searchTerm = searchInput.value.trim().toLowerCase();
        const filteredList = !searchTerm 
            ? fullHistoryList
            : fullHistoryList.filter(item => {
                const name = (item.name || '').toLowerCase();
                const author = (item.context?.author || '').toLowerCase();
                const text = (item.context?.text || '').toLowerCase();
                const query = (item.context?.query || '').toLowerCase();
                return name.includes(searchTerm) || author.includes(searchTerm) || text.includes(searchTerm) || query.includes(searchTerm);
            });
        
        const totalPages = Math.ceil(filteredList.length / ITEMS_PER_PAGE);
        if (currentPage > totalPages) {
            currentPage = totalPages || 1;
        }

        renderItemList(filteredList, currentPage);
        renderPagination(filteredList.length);
    }

    async function loadInitialData() {
        fullHistoryList = await vizStore.getHistoryList();
        currentPage = 1;
        refreshDisplay();
    }
    
    async function updateHistoryItemName(id, newName) {
        if (!id || !newName) return;
        await vizStore.updateName(id, newName);
        
        const itemInList = fullHistoryList.find(item => item.id == id);
        if (itemInList) itemInList.name = newName;
        
        refreshDisplay();
    }
    
    async function deleteHistoryItem(id) {
        await vizStore.deleteVisualization(id);
        fullHistoryList = await vizStore.getHistoryList();
        refreshDisplay();
    }

    async function handleItemExport(id) {
        const itemToExport = await vizStore.getVisualization(id);
        if (!itemToExport) { alert('Could not find visualization to export.'); return; }
        
        let slug = itemToExport.name || `item-${itemToExport.id}`;
        const safeSlug = slug.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
        const filename = `postscope_export_${safeSlug}_${new Date(itemToExport.timestamp).toISOString().split('T')[0]}.json`;

        const blob = new Blob([JSON.stringify([itemToExport], null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function handleFullExport() {
        const historyData = await vizStore.exportAllVisualizations();
        if (!historyData || historyData.length === 0) { alert('No history to export.'); return; }

        const blob = new Blob([JSON.stringify(historyData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `postscope_history_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    function processImportedFile(file) {
         if (!file || !file.type.match('application/json')) { alert('Please drop a valid .json file.'); return; }
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (!Array.isArray(importedData)) throw new Error('Invalid file format. Expected an array of history items.');
                
                const importedCount = await vizStore.importVisualizations(importedData);

                if (importedCount === 0) { alert('No new visualizations found to import. They may already be in your history.'); return; }
                
                alert(`Successfully imported ${importedCount} new visualization(s).`);
                await loadInitialData();
            } catch (err) {
                alert(`Error importing file: ${err.message}`);
                console.error(err);
            }
        };
        reader.readAsText(file);
    }

    function handleFileSelected(event) {
        const file = event.target.files[0];
        if (!file) return;
        processImportedFile(file);
        event.target.value = null;
    }
    
    searchInput.addEventListener('input', () => { currentPage = 1; refreshDisplay(); });

    let dragLeaveTimeout;
    const showOverlay = () => { dragOverlay.style.pointerEvents = 'auto'; dragOverlay.classList.remove('hidden'); setTimeout(() => dragOverlay.classList.remove('opacity-0'), 10); };
    const hideOverlay = () => { dragOverlay.classList.add('opacity-0'); setTimeout(() => { dragOverlay.classList.add('hidden'); dragOverlay.style.pointerEvents = 'none'; }, 300); };
    ['dragenter', 'dragover'].forEach(eventName => { window.addEventListener(eventName, e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); clearTimeout(dragLeaveTimeout); showOverlay(); } }); });
    window.addEventListener('dragleave', () => { clearTimeout(dragLeaveTimeout); dragLeaveTimeout = setTimeout(hideOverlay, 100); });
    dragOverlay.addEventListener('drop', e => { e.preventDefault(); hideOverlay(); processImportedFile(e.dataTransfer.files[0]); });
    window.addEventListener('drop', e => { e.preventDefault(); hideOverlay(); });

    historyList.addEventListener('click', e => {
        const button = e.target.closest('button');
        if (!button) return;

        e.preventDefault();
        e.stopPropagation();

        const itemEl = button.closest('.history-item');
        const id = itemEl.dataset.id;
        
        if (button.classList.contains('delete-btn')) {
            if(confirm('Are you sure you want to delete this visualization?')) { deleteHistoryItem(id); }
        } else if (button.classList.contains('export-item-btn')) {
            handleItemExport(id);
        } else if (button.classList.contains('edit-btn')) {
            const h3 = itemEl.querySelector('h3');
            const originalName = h3.childNodes[0].textContent; // Get text node only, ignore badges
            
            const input = document.createElement('input');
            input.type = 'text'; input.value = originalName;
            input.className = 'w-full text-base font-semibold bg-white dark:bg-slate-700 border border-sky-400 rounded-md px-1 py-0.5 -my-0.5 focus:outline-none focus:ring-1 focus:ring-sky-500';
            input.addEventListener('click', e => e.stopPropagation());
            
            // Handle existing badges during edit
            const badges = Array.from(h3.children);
            h3.innerHTML = '';
            h3.appendChild(input);
            input.focus(); input.select();
            
            const save = () => {
                const newName = input.value.trim();
                h3.innerHTML = ''; // Clear input
                if (newName && newName !== originalName) {
                    h3.appendChild(document.createTextNode(newName));
                    badges.forEach(b => h3.appendChild(b));
                    updateHistoryItemName(id, newName);
                } else {
                    h3.appendChild(document.createTextNode(originalName));
                    badges.forEach(b => h3.appendChild(b));
                }
            };

            input.addEventListener('blur', save);
            input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = originalName; input.blur(); } });
        }
    });
    
    clearHistoryBtn.addEventListener('click', async () => {
        if(confirm('Are you sure you want to clear your entire visualization history? This cannot be undone.')) {
            await vizStore.clearAll();
            await loadInitialData();
        }
    });
    
    toggleBtn.addEventListener('click', () => {
        const isHidden = instructionsContent.style.display === 'none';
        instructionsContent.style.display = isHidden ? 'block' : 'none';
        toggleBtn.innerHTML = isHidden 
            ? 'Hide Instructions <span class="material-symbols-outlined text-base ml-1">expand_less</span>' 
            : 'Show Instructions <span class="material-symbols-outlined text-base ml-1">expand_more</span>';
    });

    exportBtn.addEventListener('click', handleFullExport);
    fileInput.addEventListener('change', handleFileSelected);

    // Initial load and setup resize listener for responsive pagination
    loadInitialData();
    window.addEventListener('resize', () => refreshDisplay());
});