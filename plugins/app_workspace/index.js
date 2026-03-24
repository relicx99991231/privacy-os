/**
 * 工业级独立撤销栈类 (TextEditorHistory) + IDE 辅助视觉计算 (行号、高亮)
 */
class TextEditorHistory {
    constructor(wrapper, textarea, lineNumbersDiv, highlightDiv, onChangeCallback) {
        this.wrapper = wrapper;
        this.el = textarea;
        this.lnDiv = lineNumbersDiv;
        this.hlDiv = highlightDiv;
        this.onChange = onChangeCallback;
        
        this.past = [];
        this.future = [];
        this.currentState = { val: this.el.value, start: 0, end: 0 };
        
        this.isComposing = false; 
        this.isTyping = false;    
        this.groupTimer = null;   
        this.scrollTop = 0;       
        
        this.lineHeight = 22; 
        this.paddingTop = 0; 
        
        this.initEvents();
        this.updateUI(); 
    }

    initEvents() {
        this.el.addEventListener('compositionstart', () => { this.isComposing = true; });
        this.el.addEventListener('compositionend', (e) => {
            this.isComposing = false;
            this.handleInput(); 
        });

        this.el.addEventListener('input', (e) => {
            if (e.inputType === 'historyUndo') { e.preventDefault(); return this.undo(); }
            if (e.inputType === 'historyRedo') { e.preventDefault(); return this.redo(); }
            if (!this.isComposing) this.handleInput();
        });

        this.el.addEventListener('keydown', (e) => {
            if (this.isComposing) {
                if ((e.ctrlKey || e.metaKey) && ['KeyZ', 'KeyY'].includes(e.code)) e.preventDefault();
                return;
            }
            if (e.ctrlKey || e.metaKey) {
                if (e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); } 
                else if (e.code === 'KeyY') { e.preventDefault(); this.redo(); }
            }
        });

        let ticking = false;
        const syncUI = () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    this.updateUI();
                    ticking = false;
                });
                ticking = true;
            }
        };
        
        this.el.addEventListener('mouseup', syncUI);
        this.el.addEventListener('keyup', syncUI);
        this.el.addEventListener('scroll', syncUI);
        
        this.el.addEventListener('focus', () => { this.hlDiv.style.display = 'block'; syncUI(); });
        this.el.addEventListener('blur', () => { this.hlDiv.style.display = 'none'; });
    }

    _fastLineCount(str, limitPos = -1) {
        let count = 1;
        let pos = str.indexOf('\n');
        const limit = limitPos !== -1 ? limitPos : str.length;
        while (pos !== -1 && pos < limit) { count++; pos = str.indexOf('\n', pos + 1); }
        return count;
    }

    updateUI() {
        if (!this.el) return;
        const val = this.el.value;
        const scrollTop = this.el.scrollTop;
        const clientHeight = this.el.clientHeight || window.innerHeight;
        
        if (!this.isTyping && !this.isComposing) {
            this.currentState.start = this.el.selectionStart || 0;
            this.currentState.end = this.el.selectionEnd || 0;
        }

        const totalLines = this._fastLineCount(val);
        const startLine = Math.max(1, Math.floor((scrollTop - this.paddingTop) / this.lineHeight) + 1);
        const visibleLines = Math.ceil(clientHeight / this.lineHeight) + 2; 
        const endLine = Math.min(totalLines, startLine + visibleLines);

        let nums = '';
        for (let i = startLine; i <= endLine; i++) nums += i + '\n';
        this.lnDiv.innerText = nums;

        const offsetCalc = (startLine - 1) * this.lineHeight + this.paddingTop;
        this.lnDiv.style.transform = `translateY(${offsetCalc - scrollTop}px)`;

        const pos = this.el.selectionStart || 0;
        const currentLine = this._fastLineCount(val, pos) - 1;

        const topPos = this.paddingTop + (currentLine * this.lineHeight) - scrollTop;
        
        if (topPos < -this.lineHeight || topPos > clientHeight) {
            this.hlDiv.style.visibility = 'hidden';
        } else {
            this.hlDiv.style.visibility = 'visible';
            this.hlDiv.style.top = `${topPos}px`;
        }
    }

    handleInput() {
        const val = this.el.value;
        if (val === this.currentState.val) return;

        const start = this.el.selectionStart;
        const end = this.el.selectionEnd;

        if (!this.isTyping) {
            this.past.push({ ...this.currentState });
            if (this.past.length > 200) this.past.shift(); 
            this.isTyping = true;
        }

        this.currentState = { val, start, end };
        this.future = []; 

        clearTimeout(this.groupTimer);
        this.groupTimer = setTimeout(() => { this.isTyping = false; }, 500);

        this.updateUI(); 
        if (this.onChange) this.onChange(val);
    }

    undo() {
        this.isTyping = false; clearTimeout(this.groupTimer);
        if (this.past.length === 0) return;

        this.currentState.start = this.el.selectionStart || 0;
        this.currentState.end = this.el.selectionEnd || 0;
        this.future.push({ ...this.currentState });
        
        const prevState = this.past.pop();
        this.currentState = { ...prevState };
        this.applyState(this.currentState);
    }

    redo() {
        this.isTyping = false; clearTimeout(this.groupTimer);
        if (this.future.length === 0) return;

        this.currentState.start = this.el.selectionStart || 0;
        this.currentState.end = this.el.selectionEnd || 0;
        this.past.push({ ...this.currentState });
        
        const nextState = this.future.pop();
        this.currentState = { ...nextState };
        this.applyState(this.currentState);
    }

    applyState(state) {
        this.el.value = state.val || '';
        this.el.focus();
        
        const len = this.el.value.length;
        const safeStart = Math.min(state.start !== undefined ? state.start : len, len);
        const safeEnd = Math.min(state.end !== undefined ? state.end : len, len);
        this.el.setSelectionRange(safeStart, safeEnd);

        this.updateUI();
        if (this.onChange) this.onChange(state.val);
    }

    saveView() {
        if (!this.el) return;
        this.scrollTop = this.el.scrollTop;
        this.currentState.start = this.el.selectionStart || 0;
        this.currentState.end = this.el.selectionEnd || 0;
    }

    restoreView() {
        if (!this.el) return;
        this.el.focus();
        this.el.scrollTop = this.scrollTop || 0;
        const len = this.el.value.length;
        const safeStart = Math.min(this.currentState.start !== undefined ? this.currentState.start : len, len);
        const safeEnd = Math.min(this.currentState.end !== undefined ? this.currentState.end : len, len);
        this.el.setSelectionRange(safeStart, safeEnd);
        this.updateUI();
    }

    destroy() {
        clearTimeout(this.groupTimer);
        if (this.wrapper && this.wrapper.parentNode) {
            this.wrapper.parentNode.removeChild(this.wrapper);
        }
        this.el = null;
        this.lnDiv = null;
        this.hlDiv = null;
        this.wrapper = null;
    }
}

// ================= 应用主程序 =================

window.AppWorkspace = {
    _activeId: null, _openTabs: [], _treeSelection: { type: 'directory', val: null }, 
    _container: null, _cloudDirtyList: [], _expandedDirs: new Set([null]), _globalClickHandler: null, 
    _editorInstances: {}, 

    mount: async function(container) {
        this._container = container;
        this._treeSelection = { type: 'directory', val: null }; 
        this._openTabs = []; this._activeId = null;

        this.renderShell();
        await SystemAPI.initPluginFS('app_workspace');
        
        this.updateDirtyState(); 
        this.renderTree(); this.renderTabs(); this.renderPathBar(); this.renderEditor();

        this._globalClickHandler = (e) => {
            const menu = document.getElementById('ws-tabs-dropdown-menu');
            const btn = document.getElementById('ws-tabs-dropdown-btn');
            if (menu && menu.style.display === 'flex' && !menu.contains(e.target) && (!btn || !btn.contains(e.target))) {
                menu.style.display = 'none';
            }
        };
        window.addEventListener('click', this._globalClickHandler);
    },

    onActivate: function() { this.renderTopBar(); this.checkSyncState(); this.updateSyncBadge(); },
    onDeactivate: function() { this.closeAllModals(); const menu = document.getElementById('ws-tabs-dropdown-menu'); if (menu) menu.style.display = 'none'; },

    renderTopBar: function() {
        const actionsHTML = `
            <button id="ws-sync-btn" class="sys-btn ghost" onclick="AppWorkspace.forceSyncCloud()" style="display:none; position:relative;">
                <span class="material-symbols-rounded">cloud_sync</span>
                <span data-i18n="app_workspace.btn_sync"></span>
                <div id="ws-sync-badge" class="sync-dot-badge" style="display:none;"></div>
            </button>
        `;
        document.getElementById('sys-app-actions').innerHTML = actionsHTML;
        I18nManager.translateDOM(document.getElementById('sys-app-actions'));
    },

    unmount: function(container) {
        if (this._globalClickHandler) window.removeEventListener('click', this._globalClickHandler);
        this.closeAllModals();
        this._openTabs = []; this._activeId = null; 
        this._treeSelection = { type: 'directory', val: null }; this._cloudDirtyList = []; 
        Object.values(this._editorInstances).forEach(inst => inst.destroy());
        this._editorInstances = {};
        container.innerHTML = '';
    },

    updateDirtyState: function() { this._cloudDirtyList = SystemAPI.getCloudDirtyList('app_workspace'); },

    checkSyncState: function() {
        const st = SystemCore.config.storage || {};
        const btn = document.getElementById('ws-sync-btn');
        if (btn) btn.style.display = (st.github || st.api) ? 'inline-flex' : 'none';
    },

    updateSyncBadge: function() {
        const badge = document.getElementById('ws-sync-badge');
        if (badge) badge.style.display = this._cloudDirtyList.length > 0 ? 'block' : 'none';
    },
    onConfigChange: function() { this.checkSyncState(); },

    renderShell: function() {
        this._container.innerHTML = `
            <div class="workspace-layout" id="ws-layout">
                <div class="ws-sidebar">
                    <div class="ws-sidebar-toolbar">
                        <div style="display: flex; gap: 4px;">
                            <button class="ws-toolbar-btn" id="btn-new-file" onclick="AppWorkspace.openAddFileModal()"><span class="material-symbols-rounded">post_add</span></button>
                            <button class="ws-toolbar-btn" id="btn-new-folder" onclick="AppWorkspace.openAddFolderModal()"><span class="material-symbols-rounded">create_new_folder</span></button>
                        </div>
                        <div style="display: flex; gap: 4px;">
                            <button class="ws-toolbar-btn" id="btn-rename" onclick="AppWorkspace.openRenameModal()"><span class="material-symbols-rounded">edit_square</span></button>
                            <button class="ws-toolbar-btn danger" id="btn-delete" onclick="AppWorkspace.handleHeaderDelete()"><span class="material-symbols-rounded">delete</span></button>
                        </div>
                    </div>
                    <div class="ws-tree-container" id="ws-tree-container"></div>
                </div>
                
                <div class="ws-editor-wrapper">
                    <div class="ws-tabs-header">
                        <button class="ws-mobile-back-btn" onclick="AppWorkspace.closeMobileEditor()">
                            <span class="material-symbols-rounded">arrow_back_ios_new</span>
                        </button>
                        <div class="ws-tabs-bar" id="ws-tabs-bar"></div>
                        
                        <button class="ws-tabs-dropdown-btn" id="ws-tabs-dropdown-btn" onclick="AppWorkspace.toggleTabsDropdown(event)">
                            <span class="material-symbols-rounded">keyboard_arrow_down</span>
                        </button>
                        <div class="ws-tabs-dropdown-menu" id="ws-tabs-dropdown-menu"></div>
                    </div>
                    
                    <div class="ws-path-bar" id="ws-path-bar" style="display: none;"></div>
                    
                    <div class="ws-editor" id="ws-editor">
                        <div id="ws-textareas-container" style="flex: 1; display: flex; flex-direction: column; position: relative; width: 100%; min-height: 0; min-width: 0;"></div>
                    </div>
                    
                    <div id="ws-empty">
                        <span class="material-symbols-rounded" style="font-size: 4rem; opacity: 0.15; margin-bottom: 20px;">terminal</span>
                        <div id="ws-empty-text" data-i18n="app_workspace.no_notes" style="font-weight: 500;"></div>
                    </div>
                </div>
            </div>
        `;
        
        const modalsHTML = `
            <div id="ws-add-folder-modal" class="sys-modal-overlay" style="display:none;" onclick="AppWorkspace.closeAllModals(event)">
                <div class="sys-modal" onclick="event.stopPropagation()">
                    <h3 data-i18n="app_workspace.new_folder"></h3>
                    <label data-i18n="app_workspace.folder_name" style="margin-top: 8px;"></label>
                    <input type="text" id="ws-new-folder-input" class="sys-input" placeholder="..." autocomplete="off">
                    <div class="modal-actions" style="margin-top: 24px;">
                        <button class="sys-btn ghost" onclick="AppWorkspace.closeAllModals()" data-i18n="core.cancel">取消</button>
                        <button class="sys-btn primary" onclick="AppWorkspace.confirmAddFolder()" data-i18n="app_workspace.create">创建</button>
                    </div>
                </div>
            </div>

            <div id="ws-add-file-modal" class="sys-modal-overlay" style="display:none;" onclick="AppWorkspace.closeAllModals(event)">
                <div class="sys-modal" onclick="event.stopPropagation()">
                    <h3 data-i18n="app_workspace.new_note"></h3>
                    <label data-i18n="app_workspace.file_name" style="margin-top: 8px;"></label>
                    <div style="display:flex; gap:8px;">
                        <input type="text" id="ws-new-file-name" class="sys-input" style="flex:1; margin-bottom:0;" autocomplete="off">
                        <select id="ws-new-file-ext" class="sys-input" style="width: 90px; margin-bottom:0; padding: 16px 12px;">
                            <option value=".txt">.txt</option>
                            <option value=".md">.md</option>
                            <option value=".js">.js</option>
                            <option value=".json">.json</option>
                            <option value="">(无)</option>
                        </select>
                    </div>
                    <div class="modal-actions" style="margin-top: 24px;">
                        <button class="sys-btn ghost" onclick="AppWorkspace.closeAllModals()" data-i18n="core.cancel">取消</button>
                        <button class="sys-btn primary" onclick="AppWorkspace.confirmAddFile()" data-i18n="app_workspace.create">创建</button>
                    </div>
                </div>
            </div>

            <div id="ws-rename-modal" class="sys-modal-overlay" style="display:none;" onclick="AppWorkspace.closeAllModals(event)">
                <div class="sys-modal" onclick="event.stopPropagation()">
                    <h3 data-i18n="app_workspace.rename"></h3>
                    <label data-i18n="app_workspace.new_name" style="margin-top: 8px;"></label>
                    <input type="text" id="ws-rename-input" class="sys-input" autocomplete="off">
                    <div class="modal-actions" style="margin-top: 24px;">
                        <button class="sys-btn ghost" onclick="AppWorkspace.closeAllModals()" data-i18n="core.cancel">取消</button>
                        <button class="sys-btn primary" onclick="AppWorkspace.confirmRename()" data-i18n="app_workspace.confirm">确定</button>
                    </div>
                </div>
            </div>

            <div id="ws-bottom-sheet-modal" class="ws-bottom-sheet-overlay" onclick="AppWorkspace.closeAllModals(event)">
                <div class="ws-bottom-sheet" onclick="event.stopPropagation()">
                    <div id="ws-sheet-title" class="ws-bottom-sheet-title"></div>
                    
                    <button id="ws-sheet-open" class="ws-sheet-btn primary" onclick="AppWorkspace.openFileFromMobile()">
                        <span class="material-symbols-rounded">menu_open</span>
                        <span data-i18n="app_workspace.open_file">打开文件</span>
                    </button>
                    
                    <button id="ws-sheet-new-file" class="ws-sheet-btn" onclick="AppWorkspace.openAddFileModal()">
                        <span class="material-symbols-rounded">post_add</span>
                        <span data-i18n="app_workspace.new_note">新建文件</span>
                    </button>
                    
                    <button id="ws-sheet-new-folder" class="ws-sheet-btn" onclick="AppWorkspace.openAddFolderModal()">
                        <span class="material-symbols-rounded">create_new_folder</span>
                        <span data-i18n="app_workspace.new_folder">新建目录</span>
                    </button>
                    
                    <button id="ws-sheet-rename" class="ws-sheet-btn" onclick="AppWorkspace.openRenameModal()">
                        <span class="material-symbols-rounded">edit_square</span>
                        <span data-i18n="app_workspace.rename">重命名</span>
                    </button>
                    
                    <button id="ws-sheet-delete" class="ws-sheet-btn danger" onclick="AppWorkspace.handleHeaderDelete()">
                        <span class="material-symbols-rounded">delete</span>
                        <span data-i18n="app_workspace.delete">删除</span>
                    </button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalsHTML);
        I18nManager.translateDOM(this._container);
        I18nManager.translateDOM(document.getElementById('ws-add-folder-modal'));
        I18nManager.translateDOM(document.getElementById('ws-add-file-modal'));
        I18nManager.translateDOM(document.getElementById('ws-rename-modal'));
        I18nManager.translateDOM(document.getElementById('ws-bottom-sheet-modal'));

        this.updateToolbarState();
    },

    updateToolbarState: function() {
        const btnNewFile = document.getElementById('btn-new-file');
        const btnNewFolder = document.getElementById('btn-new-folder');
        const btnRename = document.getElementById('btn-rename');
        const btnDelete = document.getElementById('btn-delete');
        if (!btnNewFile) return;

        const sel = this._treeSelection;
        // ⚡ 无论选中文件还是目录，都允许新建
        btnNewFile.classList.remove('disabled'); 
        btnNewFolder.classList.remove('disabled');

        if (sel.type === 'text') {
            btnRename.classList.remove('disabled'); btnDelete.classList.remove('disabled');
        } else { 
            if (sel.val === null) { btnRename.classList.add('disabled'); btnDelete.classList.add('disabled'); } 
            else { btnRename.classList.remove('disabled'); btnDelete.classList.remove('disabled'); }
        }
    },

    _isDuplicate: function(parentId, name, ignoreId = null) {
        const filelist = SystemAPI.getFileList('app_workspace');
        for (let id in filelist) {
            if (filelist[id].deleted >= 0) continue;
            if (id === ignoreId) continue;
            if (filelist[id].parentid === parentId && filelist[id].name === name) return true;
        }
        return false;
    },

    // ⚡ 核心新增：获取带有完整路径的名字
    _getFullPath: function(fileId) {
        const filelist = SystemAPI.getFileList('app_workspace');
        if (!filelist[fileId]) return 'Deleted';
        let path = [];
        let curr = fileId;
        while (curr && filelist[curr]) {
            const name = this.escape(filelist[curr].name) || I18nManager.t('app_workspace.untitled');
            path.unshift(name);
            curr = filelist[curr].parentid;
        }
        return path.join(' / ');
    },

    buildTreeData: function() {
        const filelist = SystemAPI.getFileList('app_workspace');
        const tree = { id: null, name: I18nManager.t('app_workspace.driver_root'), type: 'directory', children: [] };
        const nodeMap = { null: tree };

        for (let id in filelist) {
            if (filelist[id].deleted >= 0) continue;
            nodeMap[id] = { ...filelist[id], id: id, children: [] };
        }

        for (let id in nodeMap) {
            if (id === 'null') continue;
            const node = nodeMap[id];
            const parentId = node.parentid || null;
            if (nodeMap[parentId]) {
                nodeMap[parentId].children.push(node);
            } else {
                tree.children.push(node);
            }
        }

        const sortChildren = (node) => {
            node.children.sort((a, b) => {
                if (a.type === 'directory' && b.type !== 'directory') return -1;
                if (a.type !== 'directory' && b.type === 'directory') return 1;
                return a.name.localeCompare(b.name);
            });
            node.children.forEach(sortChildren);
        };
        sortChildren(tree);

        return tree;
    },

    renderFolderNode: function(node, level) {
        const isRoot = node.id === null;
        const isExpanded = this._expandedDirs.has(node.id);
        const isSelected = (this._treeSelection.val === node.id);
        const indent = level * 14; 
        
        let html = '';
        if (node.type === 'directory') {
            const iconName = isRoot ? 'hard_drive' : (isExpanded ? 'folder_open' : 'folder');
            const iconStyle = isRoot ? 'opacity: 0.6;' : '';
            const nameStyle = isRoot ? 'font-family: monospace; font-size: 1.05rem; font-weight: bold;' : '';
            
            html += `
                <div class="ws-tree-item ${isSelected ? 'active' : ''}" style="padding-left: ${indent + 8}px;" onclick="AppWorkspace.selectNode(event, 'directory', ${isRoot ? 'null' : `'${node.id}'`})">
                    <span class="material-symbols-rounded ws-tree-chevron ${isExpanded ? 'expanded' : ''}" onclick="event.stopPropagation(); AppWorkspace.toggleFolder(${isRoot ? 'null' : `'${node.id}'`})">chevron_right</span>
                    <span class="material-symbols-rounded ws-tree-icon" style="${iconStyle}">${iconName}</span>
                    <span class="ws-tree-name" style="${nameStyle}">${this.escape(node.name)}</span>
                </div>
            `;
            
            if (isExpanded || isRoot) { 
                node.children.forEach(child => {
                    html += this.renderFolderNode(child, level + 1);
                });
            }
        } else {
            const isDirty = this._cloudDirtyList.includes(node.id);
            html += `
                <div class="ws-tree-item file ${isSelected ? 'active' : ''}" style="padding-left: ${indent + 8}px;" onclick="AppWorkspace.selectNode(event, 'text', '${node.id}')">
                    <span class="ws-tree-chevron-placeholder"></span>
                    <span class="material-symbols-rounded ws-tree-icon">description</span>
                    <span class="ws-tree-name">${this.escape(node.name) || I18nManager.t('app_workspace.untitled')}${isDirty ? '<span class="ws-dirty-dot"></span>' : ''}</span>
                </div>
            `;
        }
        return html;
    },

    renderTree: function() {
        const container = document.getElementById('ws-tree-container');
        if (!container) return;
        const treeData = this.buildTreeData();
        container.innerHTML = this.renderFolderNode(treeData, 0);
        this.updateSyncBadge();
    },

    renderTabs: function() {
        const tabsBar = document.getElementById('ws-tabs-bar');
        const dropdownMenu = document.getElementById('ws-tabs-dropdown-menu');
        if (!tabsBar || !dropdownMenu) return;
        
        if (this._openTabs.length === 0) {
            tabsBar.innerHTML = ''; dropdownMenu.innerHTML = `<div style="padding: 12px 20px; color: var(--sys-text-muted); font-size: 0.85rem;">No open files</div>`; return;
        }

        const filelist = SystemAPI.getFileList('app_workspace');
        let tabsHtml = ''; let dropHtml = '';
        this._openTabs.forEach(fileId => {
            const meta = filelist[fileId];
            // ⚡ 修改为使用带目录结构的完整路径
            const title = meta ? this._getFullPath(fileId) : 'Deleted';
            const isDirty = this._cloudDirtyList.includes(fileId);
            const isActive = this._activeId === fileId;
            
            tabsHtml += `
                <div class="ws-tab-item ${isActive ? 'active' : ''}" onclick="AppWorkspace.clickTab('${fileId}')" id="tab-${fileId}" title="${title}">
                    <span class="material-symbols-rounded" style="font-size:1rem; opacity:0.8;">description</span>
                    <span class="ws-tab-name">${title}${isDirty ? '<span class="ws-dirty-dot" style="margin-left:4px;"></span>' : ''}</span>
                    <span class="material-symbols-rounded ws-tab-close" onclick="AppWorkspace.closeTab(event, '${fileId}')">close</span>
                </div>
            `;
            dropHtml += `
                <div class="ws-tabs-dropdown-item ${isActive ? 'active' : ''}" onclick="AppWorkspace.clickTab('${fileId}')">
                    <span class="material-symbols-rounded" style="font-size:1.1rem;">description</span>
                    <span class="ws-tab-name">${title}${isDirty ? '<span class="ws-dirty-dot" style="margin-left:4px;"></span>' : ''}</span>
                </div>
            `;
        });
        
        tabsBar.innerHTML = tabsHtml; dropdownMenu.innerHTML = dropHtml;
        this.scrollToActiveTab();
    },

    scrollToActiveTab: function() {
        if (!this._activeId) return;
        setTimeout(() => {
            const tab = document.getElementById(`tab-${this._activeId}`);
            if (tab) tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }, 50);
    },

    toggleTabsDropdown: function(e) {
        if (e) e.stopPropagation();
        const menu = document.getElementById('ws-tabs-dropdown-menu');
        menu.style.display = (menu.style.display === 'flex') ? 'none' : 'flex';
    },

    renderPathBar: function() {
        const pb = document.getElementById('ws-path-bar');
        if (!pb) return;
        if (!this._activeId) { pb.style.display = 'none'; return; }
        
        const filelist = SystemAPI.getFileList('app_workspace');
        if (!filelist[this._activeId]) return;

        pb.style.display = 'flex';
        let path = [];
        let curr = this._activeId;
        while (curr && filelist[curr]) {
            path.unshift(this.escape(filelist[curr].name));
            curr = filelist[curr].parentid;
        }
        pb.innerHTML = '/ ' + path.join('<span class="ws-path-separator">/</span>');
    },

    saveCurrentEditorState: function() {
        if (!this._activeId || !this._editorInstances[this._activeId]) return;
        this._editorInstances[this._activeId].saveView();
    },

    async renderEditor() {
        if (!this._activeId || !this._openTabs.includes(this._activeId)) {
            document.getElementById('ws-editor').classList.remove('active');
            document.getElementById('ws-empty').style.display = 'flex';
            this.renderPathBar(); return;
        }

        const filelist = SystemAPI.getFileList('app_workspace');
        if (!filelist[this._activeId]) return;

        document.getElementById('ws-editor').classList.add('active');
        document.getElementById('ws-empty').style.display = 'none';
        this.renderPathBar();

        const container = document.getElementById('ws-textareas-container');
        
        Object.keys(this._editorInstances).forEach(id => {
            if (id !== this._activeId && this._editorInstances[id].wrapper) {
                this._editorInstances[id].wrapper.style.display = 'none';
            }
        });

        let instance = this._editorInstances[this._activeId];
        
        if (!instance) {
            const content = await SystemAPI.readFile('app_workspace', this._activeId);
            const strContent = content || "";

            const wrapper = document.createElement('div');
            wrapper.className = 'ws-editor-core-container';
            wrapper.id = `ws-wrapper-${this._activeId}`;

            const highlight = document.createElement('div');
            highlight.className = 'ws-line-highlight';

            const lineNumbers = document.createElement('div');
            lineNumbers.className = 'ws-line-numbers';

            const textarea = document.createElement('textarea');
            textarea.className = 'ws-content-input';
            textarea.spellcheck = false;
            textarea.placeholder = I18nManager.t('app_workspace.placeholder_content') || " ";
            textarea.value = strContent;

            wrapper.appendChild(highlight);
            wrapper.appendChild(lineNumbers);
            wrapper.appendChild(textarea);
            container.appendChild(wrapper);
            
            instance = new TextEditorHistory(wrapper, textarea, lineNumbers, highlight, (val) => {
                clearTimeout(instance._saveTimer);
                instance._saveTimer = setTimeout(async () => {
                    await SystemAPI.writeFile('app_workspace', this._activeId, val);
                    this.updateDirtyState(); 
                    this.renderTabs(); 
                    this.renderTree(); 
                    this.updateSyncBadge(); 
                }, 300); 
            });
            
            this._editorInstances[this._activeId] = instance;
        }
        
        instance.wrapper.style.display = 'flex';
        setTimeout(() => { instance.restoreView(); }, 10);
    },

    selectNode: function(e, type, val) {
        if (e) e.stopPropagation();
        if (type === 'text' && this._activeId !== val) this.saveCurrentEditorState();

        this._treeSelection = { type, val };
        const isMobile = window.innerWidth <= 768;

        if (type === 'directory') { 
            if(val !== null) this._expandedDirs.add(val); 
            if (isMobile) this.showMobileMenu(type, val); 
        } 
        else if (type === 'text') {
            if (isMobile) {
                this.showMobileMenu(type, val);
            } else {
                if (!this._openTabs.includes(val)) this._openTabs.push(val);
                this._activeId = val;
                document.getElementById('ws-layout').classList.add('is-editing'); 
                this.renderTabs(); this.renderEditor();
            }
        }
        this.renderTree(); this.updateToolbarState();
    },

    showMobileMenu: function(type, val) {
        const modal = document.getElementById('ws-bottom-sheet-modal');
        const filelist = SystemAPI.getFileList('app_workspace');
        const name = val === null ? I18nManager.t('app_workspace.driver_root') : (filelist[val] ? filelist[val].name : 'Unknown');

        document.getElementById('ws-sheet-title').innerText = name;

        document.getElementById('ws-sheet-open').style.display = type === 'text' ? 'flex' : 'none';
        
        // ⚡ 移动端：即便选中的是文件，也显示出新建文件和文件夹的选项
        document.getElementById('ws-sheet-new-file').style.display = 'flex';
        document.getElementById('ws-sheet-new-folder').style.display = 'flex';
        
        document.getElementById('ws-sheet-rename').style.display = val !== null ? 'flex' : 'none';
        document.getElementById('ws-sheet-delete').style.display = val !== null ? 'flex' : 'none';

        modal.style.display = 'flex';
    },

    openFileFromMobile: function() {
        this.closeAllModals();
        const val = this._treeSelection.val;
        if (!this._openTabs.includes(val)) this._openTabs.push(val);
        this._activeId = val;
        document.getElementById('ws-layout').classList.add('is-editing'); 
        this.renderTabs(); this.renderEditor();
    },

    toggleFolder: function(nodeId) {
        if (this._expandedDirs.has(nodeId)) { 
            if (nodeId !== null) this._expandedDirs.delete(nodeId); 
        } else { 
            this._expandedDirs.add(nodeId); 
        }
        this.renderTree();
    },

    clickTab: function(fileId) {
        const menu = document.getElementById('ws-tabs-dropdown-menu');
        if (menu) menu.style.display = 'none'; 
        if (this._activeId !== fileId) this.saveCurrentEditorState();
        
        this._activeId = fileId;
        this._treeSelection = { type: 'text', val: fileId };
        this.renderTabs(); this.renderTree(); this.renderEditor(); this.updateToolbarState();
    },

    closeTab: function(e, fileId) {
        if (e) e.stopPropagation();
        this._openTabs = this._openTabs.filter(id => id !== fileId);
        
        if (this._editorInstances[fileId]) {
            this._editorInstances[fileId].destroy();
            delete this._editorInstances[fileId];
        }

        if (this._activeId === fileId) {
            if (this._openTabs.length > 0) {
                this._activeId = this._openTabs[this._openTabs.length - 1];
                this._treeSelection = { type: 'text', val: this._activeId };
            } else {
                this._activeId = null;
                const filelist = SystemAPI.getFileList('app_workspace');
                const meta = filelist[fileId];
                this._treeSelection = { type: 'directory', val: meta ? meta.parentid : null };
            }
            this.renderEditor();
        }
        this.renderTabs(); this.renderTree(); this.updateToolbarState();
    },

    closeMobileEditor: function() {
        this.saveCurrentEditorState();
        document.getElementById('ws-layout').classList.remove('is-editing');
    },

    handleHeaderNewFile: function() { if(!document.getElementById('btn-new-file').classList.contains('disabled')) this.openAddFileModal(); },
    
    openAddFileModal: function() { 
        this.closeAllModals(); 
        document.getElementById('ws-add-file-modal').style.display = 'flex'; 
        document.getElementById('ws-new-file-name').focus(); 
    },

    confirmAddFile: async function() {
        const name = document.getElementById('ws-new-file-name').value.trim();
        const ext = document.getElementById('ws-new-file-ext').value;
        if (!name) return;
        
        const fullName = name + ext;
        
        // ⚡ 如果选中的是文件，自动将其 parentid 作为目标新建目录
        let parentId = this._treeSelection.val; 
        if (this._treeSelection.type === 'text') {
            const filelist = SystemAPI.getFileList('app_workspace');
            if (filelist[parentId]) parentId = filelist[parentId].parentid;
        }

        if (this._isDuplicate(parentId, fullName)) return SystemUI.showToast(I18nManager.t('app_workspace.err_duplicate'));

        const fileId = await SystemAPI.createFile('app_workspace', fullName, parentId, "");
        this.updateDirtyState();
        if(parentId) this._expandedDirs.add(parentId);
        
        this.saveCurrentEditorState(); this.selectNode(null, 'text', fileId);
        this.closeAllModals();
        document.getElementById('ws-new-file-name').value = '';
    },

    openAddFolderModal: function() { 
        this.closeAllModals();
        if(!document.getElementById('btn-new-folder').classList.contains('disabled')) { 
            document.getElementById('ws-add-folder-modal').style.display = 'flex'; 
            document.getElementById('ws-new-folder-input').focus(); 
        } 
    },

    confirmAddFolder: async function() {
        // ⚡ 如果选中的是文件，自动将其 parentid 作为目标新建目录
        let parentId = this._treeSelection.val; 
        if (this._treeSelection.type === 'text') {
            const filelist = SystemAPI.getFileList('app_workspace');
            if (filelist[parentId]) parentId = filelist[parentId].parentid;
        }
        
        let name = document.getElementById('ws-new-folder-input').value.trim();
        if (!name) return;
        
        if (this._isDuplicate(parentId, name)) return SystemUI.showToast(I18nManager.t('app_workspace.err_duplicate'));

        const folderId = await SystemAPI.createDirectory('app_workspace', name, parentId);
        this.updateDirtyState();
        if(parentId) this._expandedDirs.add(parentId); 
        this.selectNode(null, 'directory', folderId);
        
        this.closeAllModals(); document.getElementById('ws-new-folder-input').value = '';
    },

    openRenameModal: function() {
        this.closeAllModals();
        const sel = this._treeSelection; 
        if (!sel || sel.val === null) return;
        const input = document.getElementById('ws-rename-input');
        const filelist = SystemAPI.getFileList('app_workspace');
        
        const meta = filelist[sel.val];
        input.value = meta ? meta.name : '';
        
        document.getElementById('ws-rename-modal').style.display = 'flex'; input.focus();
    },

    confirmRename: function() {
        const sel = this._treeSelection; 
        const newName = document.getElementById('ws-rename-input').value.trim().replace(/\//g, '-');
        if (!newName) return;

        const filelist = SystemAPI.getFileList('app_workspace');
        const meta = filelist[sel.val];
        
        if (!meta || meta.name === newName) return this.closeAllModals();
        if (this._isDuplicate(meta.parentid, newName, sel.val)) return SystemUI.showToast(I18nManager.t('app_workspace.err_duplicate'));
        
        SystemAPI.renameNode('app_workspace', sel.val, newName);

        this.updateDirtyState(); this.renderTree(); this.renderTabs(); this.renderPathBar();
        this.closeAllModals();
    },

    handleHeaderDelete: function() {
        this.closeAllModals();
        const sel = this._treeSelection;
        if (!sel || sel.val === null) return SystemUI.showToast(I18nManager.t('app_workspace.cannot_delete_root'));
        
        const msg = sel.type === 'directory' ? I18nManager.t('app_workspace.del_folder_confirm') : I18nManager.t('app_workspace.delete_confirm');
        
        SystemUI.showConfirm(msg, () => {
            SystemAPI.deleteNode('app_workspace', sel.val);
            
            const filelist = SystemAPI.getFileList('app_workspace');
            this._openTabs = this._openTabs.filter(id => {
                const isAlive = filelist[id] && filelist[id].deleted < 0;
                if (!isAlive && this._editorInstances[id]) {
                    this._editorInstances[id].destroy();
                    delete this._editorInstances[id];
                }
                return isAlive;
            });

            if (this._activeId && (!filelist[this._activeId] || filelist[this._activeId].deleted > 0)) {
                this._activeId = this._openTabs.length > 0 ? this._openTabs[this._openTabs.length - 1] : null;
            }

            this._treeSelection = { type: 'directory', val: null };
            this.updateDirtyState(); this.renderTree(); this.renderTabs(); this.renderEditor(); this.updateToolbarState();
        });
    },

    closeAllModals: function(e) {
        if (e && !e.target.id.includes('-modal') && e.target.tagName !== 'BUTTON') return;
        ['ws-add-folder-modal', 'ws-add-file-modal', 'ws-rename-modal', 'ws-bottom-sheet-modal'].forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; });
    },

    forceSyncCloud: async function() {
        if (this._cloudDirtyList.length === 0) return SystemUI.showToast(I18nManager.t('app_workspace.sync_up_to_date'));
        
        const success = await SystemAPI.syncCloud('app_workspace');
        
        if (success) {
            this.updateDirtyState();
            this.renderTree();
            this.renderTabs();
        }
    },

    escape: function(str) { return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s]); }
};