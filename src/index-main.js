import { vizStore } from './services/visualizationStore.js';

document.addEventListener('DOMContentLoaded', () => {
    const ITEMS_PER_PAGE = 5;
    let currentPage = 1;
    
    const historyList = document.getElementById('history-list');
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    const toggleBtn = document.getElementById('toggle-instructions-btn');
    const instructionsContent = document.getElementById('instructions-content');
    const exportBtn = document.getElementById('export-history-btn');
    const fileInput = document.getElementById('import-file-input');
    const historyItemTemplate = document.getElementById('history-item-template');
    const dragOverlay = document.getElementById('drag-overlay');
    const paginationControls = document.getElementById('pagination-controls');
    const appUrl = 'https://postscope.pages.dev/viewer.html';

    async function updateHistoryItemName(urlFragment, newName) {
        if (!urlFragment || !newName) return;
        await vizStore.updateName(urlFragment, newName);
        // Also update the state object if it exists
        const item = await vizStore.getVisualization(urlFragment);
        if (item && item.savedState) {
            item.savedState.visualizationName = newName;
            await vizStore.saveVisualization(item);
        }
    }
    
    async function renderHistory(page = 1) {
        currentPage = page;
        historyList.innerHTML = '';
        const history = await vizStore.getHistoryList();

        if (history.length === 0) {
            historyList.innerHTML = '<div class="text-center text-slate-500 py-8 bg-white border border-slate-200 rounded-lg shadow-sm"><p>No history yet.</p><p>Use the bookmarklet or import a file to get started.</p></div>';
            exportBtn.style.display = 'none';
            clearHistoryBtn.style.display = 'none';
            instructionsContent.style.display = 'block';
            toggleBtn.style.display = 'none';
            paginationControls.innerHTML = '';
        } else {
            exportBtn.style.display = 'inline-flex';
            clearHistoryBtn.style.display = 'inline-flex';
            toggleBtn.style.display = 'flex';

            const paginatedItems = history.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

            paginatedItems.forEach(item => {
                const templateClone = historyItemTemplate.content.cloneNode(true);
                const li = templateClone.querySelector('.history-item');
                li.dataset.id = item.id;
                li.dataset.urlFragment = item.urlFragment;
                
                const title = item.name || 'Untitled Visualization';
                const date = new Date(item.timestamp).toLocaleString();
                
                const mainLink = li.querySelector('.history-item-main');
                mainLink.href = item.hasSavedState ? `${appUrl}${item.urlFragment}` : '#';
                if (!item.hasSavedState) {
                    mainLink.title = "This visualization was not fully saved. Re-run from the source page.";
                    mainLink.style.cursor = 'not-allowed';
                    mainLink.addEventListener('click', e => e.preventDefault());
                }

                li.querySelector('h3').textContent = title;
                li.querySelector('p').textContent = `${item.postCount} posts • Visualized on ${date}`;

                historyList.appendChild(li);
            });
            renderPagination(history.length);
        }
    }

    function renderPagination(totalItems) {
        paginationControls.innerHTML = '';
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

        if (totalPages <= 1) return;

        const createButton = (text, page, isDisabled = false, isActive = false) => {
            const btn = document.createElement('button');
            btn.innerHTML = text;
            btn.disabled = isDisabled;
            const baseClasses = "px-3 py-1.5 border border-slate-300 rounded-md text-sm font-medium transition-colors";
            const activeClasses = "bg-sky-600 border-sky-600 text-white";
            const defaultClasses = "bg-white text-slate-700 hover:bg-slate-50";
            const disabledClasses = "bg-slate-100 text-slate-400 cursor-not-allowed";

            btn.className = `${baseClasses} ${isDisabled ? disabledClasses : (isActive ? activeClasses : defaultClasses)}`;
            if (!isDisabled) {
                btn.addEventListener('click', () => renderHistory(page));
            }
            return btn;
        };

        paginationControls.appendChild(createButton('« Prev', currentPage - 1, currentPage === 1));
        for (let i = 1; i <= totalPages; i++) {
            paginationControls.appendChild(createButton(i, i, false, i === currentPage));
        }
        paginationControls.appendChild(createButton('Next »', currentPage + 1, currentPage === totalPages));
    }
    
    async function deleteHistoryItem(urlFragment) {
        await vizStore.deleteVisualization(urlFragment);
        const history = await vizStore.getHistoryList();
        const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE);
        if (currentPage > totalPages) {
            currentPage = totalPages || 1;
        }
        renderHistory(currentPage);
    }

    async function handleItemExport(urlFragment) {
        const itemToExport = await vizStore.getVisualization(urlFragment);
        if (!itemToExport) {
            alert('Could not find visualization to export.');
            return;
        }
        
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
        if (!historyData || historyData.length === 0) {
            alert('No history to export.');
            return;
        }
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
         if (!file || !file.type.match('application/json')) {
            alert('Please drop a valid .json file.');
            return;
        }
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (!Array.isArray(importedData)) throw new Error('Invalid file format. Expected an array of history items.');
                
                const importedCount = await vizStore.importVisualizations(importedData);

                if (importedCount === 0) {
                    alert('No new visualizations found to import. They may already be in your history.');
                    return;
                }
                
                await renderHistory(1);
                alert(`Successfully imported ${importedCount} new visualization(s).`);
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
        event.target.value = null; // Reset input
    }
    
    // Drag and Drop Listeners
    let dragLeaveTimeout;
    const showOverlay = () => { dragOverlay.style.pointerEvents = 'auto'; dragOverlay.classList.remove('hidden'); setTimeout(() => dragOverlay.classList.remove('opacity-0'), 10); };
    const hideOverlay = () => { dragOverlay.classList.add('opacity-0'); setTimeout(() => { dragOverlay.classList.add('hidden'); dragOverlay.style.pointerEvents = 'none'; }, 300); };
    ['dragenter', 'dragover'].forEach(eventName => { window.addEventListener(eventName, e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); clearTimeout(dragLeaveTimeout); showOverlay(); } }); });
    window.addEventListener('dragleave', () => { clearTimeout(dragLeaveTimeout); dragLeaveTimeout = setTimeout(hideOverlay, 100); });
    dragOverlay.addEventListener('drop', e => { e.preventDefault(); hideOverlay(); processImportedFile(e.dataTransfer.files[0]); });
    window.addEventListener('drop', e => { e.preventDefault(); hideOverlay(); });

    // Event Listeners for buttons
    historyList.addEventListener('click', e => {
        const button = e.target.closest('button');
        if (!button) return;

        e.preventDefault();
        e.stopPropagation();

        const itemEl = button.closest('.history-item');
        const urlFragment = itemEl.dataset.urlFragment;
        
        if (button.classList.contains('delete-btn')) {
            if(confirm('Are you sure you want to delete this visualization?')) {
                deleteHistoryItem(urlFragment);
            }
        } else if (button.classList.contains('export-item-btn')) {
            handleItemExport(urlFragment);
        } else if (button.classList.contains('edit-btn')) {
            const h3 = itemEl.querySelector('h3');
            const originalName = h3.textContent;
            
            const input = document.createElement('input');
            input.type = 'text'; input.value = originalName;
            input.className = 'w-full text-base font-semibold bg-white border border-sky-400 rounded-md px-1 py-0.5 -my-0.5 focus:outline-none focus:ring-1 focus:ring-sky-500';
            input.addEventListener('click', e => e.stopPropagation());
            
            h3.replaceWith(input);
            input.focus(); input.select();
            
            const save = () => {
                const newName = input.value.trim();
                if (newName && newName !== originalName) {
                    h3.textContent = newName;
                    updateHistoryItemName(urlFragment, newName);
                } else {
                    h3.textContent = originalName;
                }
                input.replaceWith(h3);
            };

            input.addEventListener('blur', save);
            input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = originalName; input.blur(); } });
        }
    });
    
    clearHistoryBtn.addEventListener('click', async () => {
        if(confirm('Are you sure you want to clear your entire visualization history? This cannot be undone.')) {
            await vizStore.clearAll();
            renderHistory(1);
        }
    });
    
    toggleBtn.addEventListener('click', () => {
        const isHidden = instructionsContent.style.display === 'none';
        instructionsContent.style.display = isHidden ? 'block' : 'none';
        toggleBtn.innerHTML = isHidden ? 'Hide Instructions <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" /></svg>' : 'Show Instructions <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>';
    });

    exportBtn.addEventListener('click', handleFullExport);
    fileInput.addEventListener('change', handleFileSelected);

    renderHistory(1);
});