/**
 * 私有工作区核心 - 终极沙箱版 (Monaco + Vditor + Iframe隔离的Luckysheet)
 * 【重构】：完全摒弃 JSON 格式，统一采用真实二进制 Xlsx (Base64) 进行双向读写。
 * 【隔离】：采用 Iframe Sandbox 彻底隔离 Luckysheet，支持多 Tab 秒切不重绘。
 * 【动态暗色】：引入 Filter 滤镜魔法，完美让 Canvas 表格跟随 OS 系统的日/夜间模式切换！
 * 【国际化】：全量修复硬编码的中文，完美支持 I18n 语言切换。
 */

window.AppWorkspace = {
    _activeId: null, _openTabs: [], _treeSelection: { type: 'directory', val: null }, 
    _container: null, _cloudDirtyList: [], _expandedDirs: new Set([null]), _globalClickHandler: null, 
    _editorInstances: {}, _resizeHandler: null, _themeObserver: null,
    
    _isMdWideMode: localStorage.getItem('ws_md_wide') === 'true',

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
            const contextMenu = document.getElementById('ws-context-menu');
            if (contextMenu && contextMenu.style.display === 'flex' && !contextMenu.contains(e.target)) {
                contextMenu.style.display = 'none';
            }
        };
        window.addEventListener('mousedown', this._globalClickHandler);
        window.addEventListener('contextmenu', (e) => {
            const contextMenu = document.getElementById('ws-context-menu');
            if (contextMenu && contextMenu.style.display === 'flex' && !contextMenu.contains(e.target) && !e.target.closest('#ws-tree-container')) {
                contextMenu.style.display = 'none';
            }
        });

        this._resizeHandler = () => {
            if (this._activeId && this._editorInstances[this._activeId]) {
                const inst = this._editorInstances[this._activeId];
                if (inst.type === 'monaco' && inst.core) inst.core.layout();
            }
        };
        window.addEventListener('resize', this._resizeHandler);

        this._themeObserver = new MutationObserver((mutations) => {
            mutations.forEach(m => {
                if (m.attributeName === 'data-theme') {
                    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                    
                    if (window.monaco) monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs');

                    Object.values(this._editorInstances).forEach(inst => {
                        if (inst.type === 'vditor' && inst.core && typeof inst.core.setTheme === 'function') {
                            inst.core.setTheme(
                                isDark ? 'dark' : 'classic', 
                                isDark ? 'dark' : 'light', 
                                isDark ? 'native' : 'github'
                            );
                        } else if (inst.type === 'luckysheet' && inst.iframe) {
                            this._applyLuckysheetTheme(inst.iframe, isDark);
                        }
                    });
                }
            });
        });
        this._themeObserver.observe(document.documentElement, { attributes: true });
    },

    _applyLuckysheetTheme: function(iframe, isDark) {
        if (!iframe) return;
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        
        let styleEl = doc.getElementById('luckysheet-dark-theme');
        if (isDark) {
            if (!styleEl) {
                styleEl = doc.createElement('style');
                styleEl.id = 'luckysheet-dark-theme';
                styleEl.innerHTML = `
                    html { 
                        filter: invert(0.9) hue-rotate(180deg); 
                        background: #111; 
                    }
                    body { background: #fff; } 
                `;
                doc.head.appendChild(styleEl);
            }
        } else {
            if (styleEl) styleEl.remove();
        }
    },

    onActivate: function() { 
        this.renderTopBar(); this.checkSyncState(); this.updateSyncBadge(); 
        if (this._activeId && this._editorInstances[this._activeId]) {
            const inst = this._editorInstances[this._activeId];
            if (inst.type === 'monaco' && inst.core) setTimeout(() => inst.core.layout(), 50);
        }
    },
    
    onDeactivate: function() { 
        this.closeAllModals(); 
        const menu = document.getElementById('ws-tabs-dropdown-menu'); 
        if (menu) menu.style.display = 'none'; 
    },

    renderTopBar: function() {
        const actionsHTML = `
            <button id="ws-md-width-btn" class="sys-btn ghost" onclick="AppWorkspace.toggleMdWidth()" style="display:none; position:relative;" title="${window.I18nManager ? I18nManager.t('app_workspace.toggle_width') : 'Toggle Width'}">
                <span class="material-symbols-rounded" id="ws-md-width-icon">${this._isMdWideMode ? 'close_fullscreen' : 'open_in_full'}</span>
            </button>
            <button id="ws-sync-btn" class="sys-btn ghost" onclick="AppWorkspace.forceSyncCloud()" style="display:none; position:relative;">
                <span class="material-symbols-rounded">cloud_sync</span>
                <span data-i18n="app_workspace.btn_sync">同步</span>
                <div id="ws-sync-badge" class="sync-dot-badge" style="display:none;"></div>
            </button>
        `;
        document.getElementById('sys-app-actions').innerHTML = actionsHTML;
        if (window.I18nManager) I18nManager.translateDOM(document.getElementById('sys-app-actions'));
        
        this.updateTopBarActions();
    },

    toggleMdWidth: function() {
        this._isMdWideMode = !this._isMdWideMode;
        localStorage.setItem('ws_md_wide', this._isMdWideMode); 
        this.updateTopBarActions();
    },

    updateTopBarActions: function() {
        const mdBtn = document.getElementById('ws-md-width-btn');
        const icon = document.getElementById('ws-md-width-icon');
        const layout = document.getElementById('ws-layout');
        
        if (layout) {
            if (this._isMdWideMode) layout.classList.add('is-md-wide');
            else layout.classList.remove('is-md-wide');
        }

        if (icon) icon.innerText = this._isMdWideMode ? 'close_fullscreen' : 'open_in_full';

        if (!mdBtn) return;
        if (!this._activeId) { mdBtn.style.display = 'none'; return; }

        const filelist = SystemAPI.getFileList('app_workspace');
        const meta = filelist[this._activeId];
        if (meta) {
            const lang = this._getLanguage(meta.name);
            mdBtn.style.display = (lang === 'markdown') ? 'inline-flex' : 'none';
        } else {
            mdBtn.style.display = 'none';
        }
    },

    unmount: function(container) {
        if (this._globalClickHandler) window.removeEventListener('mousedown', this._globalClickHandler);
        if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
        if (this._themeObserver) this._themeObserver.disconnect();
        
        this.closeAllModals();
        this._openTabs = []; this._activeId = null; 
        this._treeSelection = { type: 'directory', val: null }; this._cloudDirtyList = []; 
        
        Object.values(this._editorInstances).forEach(inst => {
            if (inst.type === 'monaco' && typeof inst.core.dispose === 'function') inst.core.dispose();
            if (inst.type === 'vditor' && typeof inst.core.destroy === 'function') inst.core.destroy();
        });

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
            <div class="workspace-layout ${this._isMdWideMode ? 'is-md-wide' : ''}" id="ws-layout">
                <div class="ws-sidebar">
                    <div class="ws-sidebar-toolbar">
                        <div style="display: flex; gap: 4px;">
                            <button class="ws-toolbar-btn" id="btn-new-file" onclick="AppWorkspace.openAddFileModal()" title="${window.I18nManager ? I18nManager.t('app_workspace.new_note') : 'New File'}"><span class="material-symbols-rounded">post_add</span></button>
                            <button class="ws-toolbar-btn" id="btn-new-folder" onclick="AppWorkspace.openAddFolderModal()" title="${window.I18nManager ? I18nManager.t('app_workspace.new_folder') : 'New Folder'}"><span class="material-symbols-rounded">create_new_folder</span></button>
                        </div>
                        <div style="display: flex; gap: 4px;">
                            <button class="ws-toolbar-btn" id="btn-move" onclick="AppWorkspace.openMoveModal()" title="${window.I18nManager ? I18nManager.t('app_workspace.move') : 'Move'}"><span class="material-symbols-rounded">drive_file_move</span></button>
                            <button class="ws-toolbar-btn" id="btn-rename" onclick="AppWorkspace.openRenameModal()" title="${window.I18nManager ? I18nManager.t('app_workspace.rename') : 'Rename'}"><span class="material-symbols-rounded">edit_square</span></button>
                            <button class="ws-toolbar-btn danger" id="btn-delete" onclick="AppWorkspace.handleHeaderDelete()" title="${window.I18nManager ? I18nManager.t('app_workspace.delete') : 'Delete'}"><span class="material-symbols-rounded">delete</span></button>
                        </div>
                    </div>
                    <div class="ws-tree-container" id="ws-tree-container" onclick="AppWorkspace.selectNode(event, 'directory', null)" oncontextmenu="AppWorkspace.showContextMenu(event, 'directory', null)"></div>
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
                        <div id="ws-textareas-container" style="flex: 1; display: flex; flex-direction: column; position: relative; width: 100%; height: 100%;"></div>
                    </div>
                    
                    <div id="ws-empty">
                        <span class="material-symbols-rounded" style="font-size: 4rem; opacity: 0.15; margin-bottom: 20px;">terminal</span>
                        <div id="ws-empty-text" data-i18n="app_workspace.no_notes" style="font-weight: 500;"></div>
                    </div>
                </div>
            </div>
        `;
        
        const modalsHTML = `
            <div id="ws-context-menu" class="ws-context-menu" oncontextmenu="event.preventDefault()"></div>

            <div id="ws-add-folder-modal" class="sys-modal-overlay" style="display:none;" onmousedown="if(event.target===this) AppWorkspace.closeAllModals()">
                <div class="sys-modal">
                    <h3 data-i18n="app_workspace.new_folder">新建文件夹</h3>
                    <label data-i18n="app_workspace.folder_name" style="margin-top: 8px;">名称</label>
                    <input type="text" id="ws-new-folder-input" class="sys-input" placeholder="..." autocomplete="off">
                    <div class="modal-actions" style="margin-top: 24px;">
                        <button class="sys-btn ghost" onclick="AppWorkspace.closeAllModals()" data-i18n="core.cancel">取消</button>
                        <button class="sys-btn primary" onclick="AppWorkspace.confirmAddFolder()" data-i18n="app_workspace.create">创建</button>
                    </div>
                </div>
            </div>

            <div id="ws-add-file-modal" class="sys-modal-overlay" style="display:none;" onmousedown="if(event.target===this) AppWorkspace.closeAllModals()">
                <div class="sys-modal">
                    <h3 data-i18n="app_workspace.new_note">新建文件</h3>
                    <label data-i18n="app_workspace.file_name" style="margin-top: 8px;">名称</label>
                    <div style="display:flex; gap:8px;">
                        <input type="text" id="ws-new-file-name" class="sys-input" style="flex:1; margin-bottom:0;" autocomplete="off">
                        <select id="ws-new-file-ext" class="sys-input" style="width: 120px; margin-bottom:0; padding: 16px 12px;">
                            <option value=".md">.md</option>
                            <option value=".xlsx">.xlsx</option>
                            <option value=".js">.js</option>
                            <option value=".cpp">.cpp</option>
                            <option value=".c">.c</option>
                            <option value=".py">.py</option>
                            <option value=".json">.json</option>
                            <option value=".css">.css</option>
                            <option value=".html">.html</option>
                            <option value=".txt">.txt</option>
                            <option value="" data-i18n="app_workspace.no_ext">(无)</option>
                        </select>
                    </div>
                    <div class="modal-actions" style="margin-top: 24px;">
                        <button class="sys-btn ghost" onclick="AppWorkspace.closeAllModals()" data-i18n="core.cancel">取消</button>
                        <button class="sys-btn primary" onclick="AppWorkspace.confirmAddFile()" data-i18n="app_workspace.create">创建</button>
                    </div>
                </div>
            </div>

            <div id="ws-rename-modal" class="sys-modal-overlay" style="display:none;" onmousedown="if(event.target===this) AppWorkspace.closeAllModals()">
                <div class="sys-modal">
                    <h3 data-i18n="app_workspace.rename">重命名</h3>
                    <label data-i18n="app_workspace.new_name" style="margin-top: 8px;">新名称</label>
                    <input type="text" id="ws-rename-input" class="sys-input" autocomplete="off">
                    <div class="modal-actions" style="margin-top: 24px;">
                        <button class="sys-btn ghost" onclick="AppWorkspace.closeAllModals()" data-i18n="core.cancel">取消</button>
                        <button class="sys-btn primary" onclick="AppWorkspace.confirmRename()" data-i18n="app_workspace.confirm">确定</button>
                    </div>
                </div>
            </div>

            <div id="ws-move-modal" class="sys-modal-overlay" style="display:none;" onmousedown="if(event.target===this) AppWorkspace.closeAllModals()">
                <div class="sys-modal">
                    <h3 data-i18n="app_workspace.move">移动到</h3>
                    <label data-i18n="app_workspace.target_folder" style="margin-top: 8px;">选择目标目录</label>
                    <select id="ws-move-target" class="sys-input" style="padding: 12px; margin-bottom: 0;"></select>
                    <div class="modal-actions" style="margin-top: 24px;">
                        <button class="sys-btn ghost" onclick="AppWorkspace.closeAllModals()" data-i18n="core.cancel">取消</button>
                        <button class="sys-btn primary" onclick="AppWorkspace.confirmMove()" data-i18n="app_workspace.confirm">确定</button>
                    </div>
                </div>
            </div>

            <div id="ws-bottom-sheet-modal" class="ws-bottom-sheet-overlay" onmousedown="if(event.target===this) AppWorkspace.closeAllModals()">
                <div class="ws-bottom-sheet">
                    <div id="ws-sheet-title" class="ws-bottom-sheet-title"></div>
                    <button id="ws-sheet-open" class="ws-sheet-btn primary" onclick="AppWorkspace.openFileFromMobile()"><span class="material-symbols-rounded">menu_open</span><span data-i18n="app_workspace.open_file"></span></button>
                    <button id="ws-sheet-new-file" class="ws-sheet-btn" onclick="AppWorkspace.openAddFileModal()"><span class="material-symbols-rounded">post_add</span><span data-i18n="app_workspace.new_note"></span></button>
                    <button id="ws-sheet-new-folder" class="ws-sheet-btn" onclick="AppWorkspace.openAddFolderModal()"><span class="material-symbols-rounded">create_new_folder</span><span data-i18n="app_workspace.new_folder"></span></button>
                    
                    <button id="ws-sheet-import-file" class="ws-sheet-btn" onclick="AppWorkspace.handleImportFile()"><span class="material-symbols-rounded">upload_file</span><span data-i18n="app_workspace.import_file"></span></button>
                    <button id="ws-sheet-import-folder" class="ws-sheet-btn" onclick="AppWorkspace.handleImportFolder()"><span class="material-symbols-rounded">drive_folder_upload</span><span data-i18n="app_workspace.import_folder"></span></button>
                    <button id="ws-sheet-export" class="ws-sheet-btn" onclick="AppWorkspace.handleExport()"><span class="material-symbols-rounded">download</span><span data-i18n="app_workspace.export"></span></button>
                    
                    <button id="ws-sheet-move" class="ws-sheet-btn" onclick="AppWorkspace.openMoveModal()"><span class="material-symbols-rounded">drive_file_move</span><span data-i18n="app_workspace.move"></span></button>
                    <button id="ws-sheet-rename" class="ws-sheet-btn" onclick="AppWorkspace.openRenameModal()"><span class="material-symbols-rounded">edit_square</span><span data-i18n="app_workspace.rename"></span></button>
                    <button id="ws-sheet-delete" class="ws-sheet-btn danger" onclick="AppWorkspace.handleHeaderDelete()"><span class="material-symbols-rounded">delete</span><span data-i18n="app_workspace.delete"></span></button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalsHTML);
        if (window.I18nManager) {
            I18nManager.translateDOM(this._container);
            I18nManager.translateDOM(document.getElementById('ws-add-folder-modal'));
            I18nManager.translateDOM(document.getElementById('ws-add-file-modal'));
            I18nManager.translateDOM(document.getElementById('ws-rename-modal'));
            I18nManager.translateDOM(document.getElementById('ws-move-modal'));
            I18nManager.translateDOM(document.getElementById('ws-bottom-sheet-modal'));
        }

        this.updateToolbarState();
    },

    showContextMenu: function(e, type, val) {
        e.preventDefault(); e.stopPropagation();

        if (type === 'directory') this.clickFolder(null, val, true);
        else this.selectNode(null, type, val);

        const menu = document.getElementById('ws-context-menu');
        if (!menu) return;

        const isRoot = (val === null);
        let html = '';

        if (type === 'directory') {
            html += `<div class="ws-context-menu-item" onclick="AppWorkspace.openAddFileModal()"><span class="material-symbols-rounded">post_add</span><span data-i18n="app_workspace.new_note"></span></div>`;
            html += `<div class="ws-context-menu-item" onclick="AppWorkspace.openAddFolderModal()"><span class="material-symbols-rounded">create_new_folder</span><span data-i18n="app_workspace.new_folder"></span></div>`;
            html += `<div class="ws-context-menu-divider"></div>`;
            html += `<div class="ws-context-menu-item" onclick="AppWorkspace.handleImportFile()"><span class="material-symbols-rounded">upload_file</span><span data-i18n="app_workspace.import_file"></span></div>`;
            html += `<div class="ws-context-menu-item" onclick="AppWorkspace.handleImportFolder()"><span class="material-symbols-rounded">drive_folder_upload</span><span data-i18n="app_workspace.import_folder"></span></div>`;
            html += `<div class="ws-context-menu-item" onclick="AppWorkspace.handleExport()"><span class="material-symbols-rounded">download</span><span data-i18n="app_workspace.export"></span></div>`;
            
            if (!isRoot) {
                html += `<div class="ws-context-menu-divider"></div>`;
                html += `<div class="ws-context-menu-item" onclick="AppWorkspace.openMoveModal()"><span class="material-symbols-rounded">drive_file_move</span><span data-i18n="app_workspace.move"></span></div>`;
                html += `<div class="ws-context-menu-item" onclick="AppWorkspace.openRenameModal()"><span class="material-symbols-rounded">edit_square</span><span data-i18n="app_workspace.rename"></span></div>`;
                html += `<div class="ws-context-menu-divider"></div>`;
                html += `<div class="ws-context-menu-item danger" onclick="AppWorkspace.handleHeaderDelete()"><span class="material-symbols-rounded">delete</span><span data-i18n="app_workspace.delete"></span></div>`;
            }
        } else {
            html += `<div class="ws-context-menu-item" onclick="AppWorkspace.handleExport()"><span class="material-symbols-rounded">download</span><span data-i18n="app_workspace.export"></span></div>`;
            html += `<div class="ws-context-menu-divider"></div>`;
            html += `<div class="ws-context-menu-item" onclick="AppWorkspace.openMoveModal()"><span class="material-symbols-rounded">drive_file_move</span><span data-i18n="app_workspace.move"></span></div>`;
            html += `<div class="ws-context-menu-item" onclick="AppWorkspace.openRenameModal()"><span class="material-symbols-rounded">edit_square</span><span data-i18n="app_workspace.rename"></span></div>`;
            html += `<div class="ws-context-menu-divider"></div>`;
            html += `<div class="ws-context-menu-item danger" onclick="AppWorkspace.handleHeaderDelete()"><span class="material-symbols-rounded">delete</span><span data-i18n="app_workspace.delete"></span></div>`;
        }

        menu.innerHTML = html;
        if (window.I18nManager) I18nManager.translateDOM(menu);
        menu.style.display = 'flex';

        let x = e.clientX; let y = e.clientY;
        const rect = menu.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
        if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;

        menu.style.left = x + 'px'; menu.style.top = y + 'px';
    },

    updateToolbarState: function() {
        const btnNewFile = document.getElementById('btn-new-file');
        const btnNewFolder = document.getElementById('btn-new-folder');
        const btnRename = document.getElementById('btn-rename');
        const btnDelete = document.getElementById('btn-delete');
        const btnMove = document.getElementById('btn-move');
        if (!btnNewFile) return;

        const sel = this._treeSelection;
        btnNewFile.classList.remove('disabled'); btnNewFolder.classList.remove('disabled');

        if (sel.type === 'text') {
            btnRename.classList.remove('disabled'); btnDelete.classList.remove('disabled'); btnMove.classList.remove('disabled');
        } else { 
            if (sel.val === null) { btnRename.classList.add('disabled'); btnDelete.classList.add('disabled'); btnMove.classList.add('disabled'); } 
            else { btnRename.classList.remove('disabled'); btnDelete.classList.remove('disabled'); btnMove.classList.remove('disabled'); }
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

    _getFullPath: function(fileId) {
        const filelist = SystemAPI.getFileList('app_workspace');
        if (!filelist[fileId]) return 'Deleted';
        let path = []; let curr = fileId;
        while (curr && filelist[curr]) {
            path.unshift(this.escape(filelist[curr].name) || (window.I18nManager ? I18nManager.t('app_workspace.untitled') : 'Untitled'));
            curr = filelist[curr].parentid;
        }
        return path.join(' / ');
    },

    buildTreeData: function() {
        const filelist = SystemAPI.getFileList('app_workspace');
        const tree = { id: null, name: (window.I18nManager ? I18nManager.t('app_workspace.driver_root') : '/'), type: 'directory', children: [] };
        const nodeMap = { null: tree };

        for (let id in filelist) {
            if (filelist[id].deleted >= 0) continue;
            nodeMap[id] = { ...filelist[id], id: id, children: [] };
        }

        for (let id in nodeMap) {
            if (id === 'null') continue;
            const node = nodeMap[id];
            const parentId = node.parentid || null;
            if (nodeMap[parentId]) nodeMap[parentId].children.push(node);
            else tree.children.push(node);
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
        const indent = level * 12 + 8; 
        
        let html = '';
        if (node.type === 'directory') {
            const iconName = isRoot ? 'hard_drive' : (isExpanded ? 'folder_open' : 'folder');
            const iconStyle = isRoot ? 'opacity: 0.6;' : '';
            const nameStyle = isRoot ? 'font-weight: 600;' : '';
            
            html += `
                <div class="ws-tree-item ${isSelected ? 'active' : ''}" style="padding-left: ${indent}px;" onclick="AppWorkspace.clickFolder(event, ${isRoot ? 'null' : `'${node.id}'`})" oncontextmenu="AppWorkspace.showContextMenu(event, 'directory', ${isRoot ? 'null' : `'${node.id}'`})">
                    <span class="material-symbols-rounded ws-tree-chevron ${isExpanded ? 'expanded' : ''}" onclick="AppWorkspace.toggleFolder(event, ${isRoot ? 'null' : `'${node.id}'`})">chevron_right</span>
                    <span class="material-symbols-rounded ws-tree-icon" style="${iconStyle}">${iconName}</span>
                    <span class="ws-tree-name" style="${nameStyle}">${this.escape(node.name)}</span>
                </div>
            `;
            
            if (isExpanded || isRoot) { 
                node.children.forEach(child => { html += this.renderFolderNode(child, level + 1); });
            }
        } else {
            const isDirty = this._cloudDirtyList.includes(node.id);
            const iconName = this._getLanguage(node.name) === 'luckysheet' ? 'table_chart' : 'description';
            const untitledText = window.I18nManager ? I18nManager.t('app_workspace.untitled') : 'Untitled';
            html += `
                <div class="ws-tree-item file ${isSelected ? 'active' : ''}" style="padding-left: ${indent}px;" onclick="AppWorkspace.selectNode(event, 'text', '${node.id}')" ondblclick="AppWorkspace.openFile('${node.id}')" oncontextmenu="AppWorkspace.showContextMenu(event, 'text', '${node.id}')">
                    <span class="ws-tree-chevron-placeholder"></span>
                    <span class="material-symbols-rounded ws-tree-icon">${iconName}</span>
                    <span class="ws-tree-name">${this.escape(node.name) || untitledText}${isDirty ? '<span class="ws-dirty-dot"></span>' : ''}</span>
                </div>
            `;
        }
        return html;
    },

    clickFolder: function(e, folderId, isRightClick = false) {
        if (e) e.stopPropagation();
        const contextMenu = document.getElementById('ws-context-menu');
        if (contextMenu) contextMenu.style.display = 'none';

        this._treeSelection = { type: 'directory', val: folderId };
        
        if (!isRightClick && folderId !== null) {
            if (this._expandedDirs.has(folderId)) this._expandedDirs.delete(folderId);
            else this._expandedDirs.add(folderId);
        }
        
        if (window.innerWidth <= 768) this.showMobileMenu('directory', folderId);
        this.renderTree(); this.updateToolbarState();
    },

    toggleFolder: function(e, nodeId) {
        if (e) e.stopPropagation(); 
        if (this._expandedDirs.has(nodeId)) { if (nodeId !== null) this._expandedDirs.delete(nodeId); } 
        else { this._expandedDirs.add(nodeId); }
        this.renderTree();
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
            tabsBar.innerHTML = ''; dropdownMenu.innerHTML = `<div style="padding: 12px 20px; color: var(--sys-text-muted); font-size: 0.85rem;" data-i18n="app_workspace.no_notes">No open files</div>`; 
            if (window.I18nManager) I18nManager.translateDOM(dropdownMenu);
            return;
        }

        const filelist = SystemAPI.getFileList('app_workspace');
        let tabsHtml = ''; let dropHtml = '';
        this._openTabs.forEach(fileId => {
            const meta = filelist[fileId];
            const title = meta ? this._getFullPath(fileId) : 'Deleted';
            const isDirty = this._cloudDirtyList.includes(fileId);
            const isActive = this._activeId === fileId;
            const iconName = meta && this._getLanguage(meta.name) === 'luckysheet' ? 'table_chart' : 'description';
            
            tabsHtml += `
                <div class="ws-tab-item ${isActive ? 'active' : ''}" onclick="AppWorkspace.clickTab('${fileId}')" id="tab-${fileId}" title="${title}">
                    <span class="material-symbols-rounded" style="font-size:1rem; opacity:0.8;">${iconName}</span>
                    <span class="ws-tab-name">${title}${isDirty ? '<span class="ws-dirty-dot" style="margin-left:4px;"></span>' : ''}</span>
                    <span class="material-symbols-rounded ws-tab-close" onclick="AppWorkspace.closeTab(event, '${fileId}')">close</span>
                </div>
            `;
            dropHtml += `
                <div class="ws-tabs-dropdown-item ${isActive ? 'active' : ''}" onclick="AppWorkspace.clickTab('${fileId}')">
                    <span class="material-symbols-rounded" style="font-size:1.1rem;">${iconName}</span>
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
        let path = []; let curr = this._activeId;
        while (curr && filelist[curr]) {
            path.unshift(this.escape(filelist[curr].name));
            curr = filelist[curr].parentid;
        }
        pb.innerHTML = '/ ' + path.join('<span class="ws-path-separator">/</span>');
    },

    saveCurrentEditorState: function() {
        if (!this._activeId || !this._editorInstances[this._activeId]) return;
        const inst = this._editorInstances[this._activeId];
        if (inst.type === 'monaco' && typeof inst.core.saveViewState === 'function') {
            inst._savedViewState = inst.core.saveViewState();
        }
    },

    // 防抖保存，统一打包回 Base64 二进制 (深入 Iframe 环境提取数据)
    _triggerLuckysheetSave: function(fileId) {
        const inst = this._editorInstances[fileId];
        if (!inst) return;
        
        clearTimeout(inst._saveTimer);
        inst._saveTimer = setTimeout(async () => {
            if (inst.type === 'luckysheet' && inst.iframe && inst.iframe.contentWindow.luckysheet) {
                const allData = inst.iframe.contentWindow.luckysheet.getAllSheets();
                try {
                    const base64Data = await this._exportXlsxToBase64(allData);
                    await SystemAPI.writeFile('app_workspace', inst.id, base64Data);
                } catch (err) {
                    console.error('保存 XLSX 失败:', err);
                }
                
                this.updateDirtyState();
                this.renderTabs(); this.renderTree(); this.updateSyncBadge();
            }
        }, 2000); 
    },

    _exportXlsxToBase64: async function(luckysheetData) {
        if (!window.ExcelJS) throw new Error("缺少 ExcelJS 依赖");
        
        const workbook = new ExcelJS.Workbook();
        
        luckysheetData.forEach((sheet) => {
            if (!sheet.data || sheet.data.length === 0) return;
            const worksheet = workbook.addWorksheet(sheet.name);
            
            sheet.data.forEach((row, rowIndex) => {
                if (!row) return;
                row.forEach((cell, colIndex) => {
                    if (!cell) return;
                    let val = cell.v !== undefined ? cell.v : cell.m;
                    if (val !== undefined && val !== null) {
                        worksheet.getCell(rowIndex + 1, colIndex + 1).value = val;
                    }
                });
            });
        });
        
        const buffer = await workbook.xlsx.writeBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        
        return `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${window.btoa(binary)}`;
    },
    
    _getLanguage: function(fileName) {
        if (!fileName) return 'plaintext';
        const ext = fileName.split('.').pop().toLowerCase();
        const map = {
            'js': 'javascript', 'json': 'json', 'md': 'markdown', 'html': 'html',
            'css': 'css', 'cpp': 'cpp', 'c': 'c', 'py': 'python', 'java': 'java',
            'ts': 'typescript', 'txt': 'plaintext', 'xml': 'xml', 'yaml': 'yaml', 'sql': 'sql',
            'luckysheet': 'luckysheet', 'xlsx': 'luckysheet', 'csv': 'luckysheet', 'xls': 'luckysheet'
        };
        return map[ext] || 'plaintext';
    },

    async renderEditor() {
        if (!this._activeId || !this._openTabs.includes(this._activeId)) {
            document.getElementById('ws-editor').classList.remove('active');
            document.getElementById('ws-empty').style.display = 'flex';
            this.renderPathBar();
            this.updateTopBarActions(); 
            return;
        }

        const filelist = SystemAPI.getFileList('app_workspace');
        if (!filelist[this._activeId]) return;

        document.getElementById('ws-editor').classList.add('active');
        document.getElementById('ws-empty').style.display = 'none';
        this.renderPathBar();

        const container = document.getElementById('ws-textareas-container');
        
        Object.values(this._editorInstances).forEach(inst => {
            if (inst.id !== this._activeId && inst.wrapper) {
                inst.wrapper.style.display = 'none';
            }
        });

        let inst = this._editorInstances[this._activeId];
        const fileMeta = filelist[this._activeId];
        const lang = this._getLanguage(fileMeta.name);
        
        if (!inst) {
            const strContent = (await SystemAPI.readFile('app_workspace', this._activeId)) || "";
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

            const wrapper = document.createElement('div');
            wrapper.style.position = "absolute";
            wrapper.style.top = "0";
            wrapper.style.left = "0";
            wrapper.style.width = "100%";
            wrapper.style.height = "100%";
            wrapper.style.backgroundColor = "var(--sys-bg)"; 
            wrapper.id = `ws-wrapper-${this._activeId}`;
            container.appendChild(wrapper);
            
            if (lang === 'luckysheet') {
                const iframe = document.createElement('iframe');
                iframe.id = `luckysheet-host-${this._activeId}`;
                iframe.style.margin = '0px';
                iframe.style.padding = '0px';
                iframe.style.position = 'absolute';
                iframe.style.width = '100%'; 
                iframe.style.height = '100%';
                iframe.style.left = '0px';
                iframe.style.top = '0px';
                iframe.style.border = 'none';
                iframe.style.backgroundColor = '#ffffff'; 
                wrapper.appendChild(iframe);
                
                inst = { id: this._activeId, type: 'luckysheet', wrapper, iframe };

                const doc = iframe.contentDocument || iframe.contentWindow.document;
                doc.open();
                doc.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <link rel="stylesheet" href="libs/luckysheet/plugins/css/pluginsCss.css" />
                        <link rel="stylesheet" href="libs/luckysheet/plugins/plugins.css" />
                        <link rel="stylesheet" href="libs/luckysheet/css/luckysheet.css" />
                        <link rel="stylesheet" href="libs/luckysheet/assets/iconfont/iconfont.css" />
                        <style>
                            body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #fff; }
                            #luckysheet { margin: 0; padding: 0; position: absolute; width: 100%; height: 100%; left: 0; top: 0; }
                        </style>
                    </head>
                    <body>
                        <div id="luckysheet"></div>
                        <script src="libs/luckysheet/plugins/js/plugin.js"><\/script>
                        <script src="libs/luckysheet/luckysheet.umd.js"><\/script>
                    </body>
                    </html>
                `);
                doc.close();

                // 等待 Iframe 内核加载完毕后挂载数据
                iframe.onload = async () => {
                    const win = iframe.contentWindow;
                    if (!win || !win.luckysheet) return;

                    // 初始化时，立刻同步当前的系统 OS 主题状态给 Iframe
                    this._applyLuckysheetTheme(iframe, document.documentElement.getAttribute('data-theme') === 'dark');

                    const content = await SystemAPI.readFile('app_workspace', inst.id);
                    if (!window.LuckyExcel || !window.ExcelJS) {
                        if (window.SystemUI) SystemUI.showToast(window.I18nManager ? I18nManager.t('app_workspace.err_no_excel_lib') : 'Missing Excel libraries');
                        return;
                    }

                    const initSheet = (sheetData) => {
                        win.luckysheet.create({
                            container: 'luckysheet', 
                            showinfobar: false, // 去掉绿色的头部横条
                            lang: (window.I18nManager && I18nManager.currentLang === 'zh') ? 'zh' : 'en',
                            data: sheetData,
                            hook: {
                                updated: () => this._triggerLuckysheetSave(inst.id)
                            }
                        });
                    };

                    if (content && content.startsWith('data:')) {
                        const res = await fetch(content);
                        const blob = await res.blob();
                        const file = new File([blob], fileMeta.name);
                        
                        window.LuckyExcel.transformExcelToLucky(file, (exportJson) => {
                            if(!exportJson.sheets || exportJson.sheets.length === 0) return;
                            initSheet(exportJson.sheets);
                        });
                    } else {
                        initSheet([{ name: "Sheet1", status: 1 }]);
                    }
                };
                
            } else if (lang === 'markdown') {
                await SystemCore.loadVditor(); 
                const vContainer = document.createElement('div');
                vContainer.id = `vditor-host-${this._activeId}`;
                wrapper.appendChild(vContainer);
                
                const vditorCore = await new Promise(resolve => {
                    const v = new window.Vditor(vContainer.id, {
                        value: strContent, mode: 'ir', height: '100%', width: '100%', cache: { enable: false }, cdn: 'libs/vditor', theme: isDark ? 'dark' : 'classic', icon: 'material', outline: { enable: false, position: 'left' }, preview: { theme: { current: isDark ? 'dark' : 'light' }, hljs: { style: isDark ? 'native' : 'github' } },
                        input: (val) => {
                            clearTimeout(v._saveTimer);
                            v._saveTimer = setTimeout(async () => {
                                await SystemAPI.writeFile('app_workspace', this._activeId, val);
                                this.updateDirtyState(); 
                                this.renderTabs(); this.renderTree(); this.updateSyncBadge(); 
                            }, 500); 
                        },
                        after: () => resolve(v)
                    });
                });
                
                inst = { id: this._activeId, type: 'vditor', core: vditorCore, wrapper };
                
            } else {
                await SystemCore.loadMonaco(); 
                
                const monacoCore = monaco.editor.create(wrapper, {
                    value: strContent, language: lang, theme: isDark ? 'vs-dark' : 'vs', automaticLayout: true, wordWrap: lang === 'plaintext' ? 'on' : 'off', minimap: { enabled: false }, fontSize: 14, fontFamily: "'Consolas', 'Courier New', monospace", scrollBeyondLastLine: false, roundedSelection: false, padding: { top: 16 }
                });

                monacoCore.onDidChangeModelContent(() => {
                    clearTimeout(monacoCore._saveTimer);
                    monacoCore._saveTimer = setTimeout(async () => {
                        await SystemAPI.writeFile('app_workspace', this._activeId, monacoCore.getValue());
                        this.updateDirtyState(); 
                        this.renderTabs(); this.renderTree(); this.updateSyncBadge(); 
                    }, 500); 
                });
                
                inst = { id: this._activeId, type: 'monaco', core: monacoCore, wrapper };
            }
            this._editorInstances[this._activeId] = inst;
        }
        
        if (inst.wrapper) inst.wrapper.style.display = 'block';

        if (inst.type !== 'luckysheet') {
            setTimeout(() => { 
                if (inst.type === 'monaco' && inst.core) {
                    inst.core.layout(); 
                    if (inst._savedViewState) inst.core.restoreViewState(inst._savedViewState);
                    inst.core.focus();
                } else if (inst.type === 'vditor' && inst.core) {
                    inst.core.focus();
                }
            }, 50);
        }

        this.updateTopBarActions();
    },

    selectNode: function(e, type, val) {
        if (e) e.stopPropagation();
        
        const contextMenu = document.getElementById('ws-context-menu');
        if (contextMenu) contextMenu.style.display = 'none';

        this._treeSelection = { type, val };
        const isMobile = window.innerWidth <= 768;

        if (type === 'directory') { 
            if (val !== null) this._expandedDirs.add(val); 
            if (isMobile) this.showMobileMenu(type, val); 
        } 
        else if (type === 'text') {
            if (isMobile) {
                this.showMobileMenu(type, val);
            }
        }
        this.renderTree(); this.updateToolbarState();
    },

    openFile: function(fileId) {
        if (!this._openTabs.includes(fileId)) this._openTabs.push(fileId);
        if (this._activeId !== fileId) this.saveCurrentEditorState();
        this._activeId = fileId;
        document.getElementById('ws-layout').classList.add('is-editing'); 
        this.renderTabs(); this.renderEditor(); this.updateTopBarActions();
    },

    showMobileMenu: function(type, val) {
        const modal = document.getElementById('ws-bottom-sheet-modal');
        const filelist = SystemAPI.getFileList('app_workspace');
        const name = val === null ? (window.I18nManager ? I18nManager.t('app_workspace.driver_root') : '/') : (filelist[val] ? filelist[val].name : (window.I18nManager ? I18nManager.t('app_workspace.untitled') : 'Unknown'));

        document.getElementById('ws-sheet-title').innerText = name;

        document.getElementById('ws-sheet-open').style.display = type === 'text' ? 'flex' : 'none';
        
        document.getElementById('ws-sheet-new-file').style.display = 'flex';
        document.getElementById('ws-sheet-new-folder').style.display = 'flex';
        document.getElementById('ws-sheet-import-file').style.display = 'flex';
        document.getElementById('ws-sheet-import-folder').style.display = 'flex';
        document.getElementById('ws-sheet-export').style.display = 'flex';
        
        document.getElementById('ws-sheet-move').style.display = val !== null ? 'flex' : 'none';
        document.getElementById('ws-sheet-rename').style.display = val !== null ? 'flex' : 'none';
        document.getElementById('ws-sheet-delete').style.display = val !== null ? 'flex' : 'none';

        modal.style.display = 'flex';
    },

    openFileFromMobile: function() {
        this.closeAllModals();
        const val = this._treeSelection.val;
        this.openFile(val);
    },

    clickTab: function(fileId) {
        const menu = document.getElementById('ws-tabs-dropdown-menu');
        if (menu) menu.style.display = 'none'; 
        if (this._activeId !== fileId) this.saveCurrentEditorState();
        
        this._activeId = fileId;
        this.renderTabs(); this.renderEditor(); this.updateTopBarActions();
    },

    closeTab: function(e, fileId) {
        if (e) e.stopPropagation();
        this._openTabs = this._openTabs.filter(id => id !== fileId);
        
        const inst = this._editorInstances[fileId];
        if (inst) {
            if (inst.type === 'monaco' && inst.core.dispose) inst.core.dispose();
            if (inst.type === 'vditor' && inst.core.destroy) inst.core.destroy();
            if (inst.wrapper) inst.wrapper.remove(); 
            delete this._editorInstances[fileId];
        }

        if (this._activeId === fileId) {
            if (this._openTabs.length > 0) {
                this._activeId = this._openTabs[this._openTabs.length - 1];
            } else {
                this._activeId = null;
            }
            this.renderEditor();
        }
        this.renderTabs();
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
        
        let parentId = this._treeSelection.val; 
        if (this._treeSelection.type === 'text') {
            const filelist = SystemAPI.getFileList('app_workspace');
            if (filelist[parentId]) parentId = filelist[parentId].parentid;
        }

        if (this._isDuplicate(parentId, fullName)) return SystemUI.showToast(window.I18nManager ? I18nManager.t('app_workspace.err_duplicate') : '同名文件已存在');

        const fileId = await SystemAPI.createFile('app_workspace', fullName, parentId, "");
        this.updateDirtyState();
        if(parentId) this._expandedDirs.add(parentId);
        
        this.saveCurrentEditorState(); 
        this.selectNode(null, 'text', fileId);
        this.openFile(fileId); 
        
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
        let parentId = this._treeSelection.val; 
        if (this._treeSelection.type === 'text') {
            const filelist = SystemAPI.getFileList('app_workspace');
            if (filelist[parentId]) parentId = filelist[parentId].parentid;
        }
        
        let name = document.getElementById('ws-new-folder-input').value.trim();
        if (!name) return;
        
        if (this._isDuplicate(parentId, name)) return SystemUI.showToast(window.I18nManager ? I18nManager.t('app_workspace.err_duplicate') : '同名文件夹已存在');

        const folderId = await SystemAPI.createDirectory('app_workspace', name, parentId);
        this.updateDirtyState();
        if(parentId) this._expandedDirs.add(parentId); 
        this.selectNode(null, 'directory', folderId);
        
        this.closeAllModals(); document.getElementById('ws-new-folder-input').value = '';
    },

    openMoveModal: function() {
        this.closeAllModals();
        const sel = this._treeSelection;
        if (!sel || sel.val === null) return SystemUI.showToast(window.I18nManager ? I18nManager.t('app_workspace.cannot_move_root') : '不能移动根目录');
        
        const filelist = SystemAPI.getFileList('app_workspace');
        const selectEl = document.getElementById('ws-move-target');
        selectEl.innerHTML = `<option value="null">/ (${window.I18nManager ? I18nManager.t('app_workspace.driver_root') : 'Root'})</option>`;
        
        const isDescendant = (childId, ancestorId) => {
            let curr = childId;
            while (curr) {
                if (curr === ancestorId) return true;
                curr = filelist[curr] ? filelist[curr].parentid : null;
            }
            return false;
        };

        const dirs = [];
        for (let id in filelist) {
            if (filelist[id].deleted >= 0) continue;
            if (filelist[id].type === 'directory') {
                if (!isDescendant(id, sel.val)) {
                    dirs.push({ id, path: this._getFullPath(id) });
                }
            }
        }
        
        dirs.sort((a, b) => a.path.localeCompare(b.path));
        dirs.forEach(d => {
            selectEl.innerHTML += `<option value="${d.id}">${d.path}</option>`;
        });

        document.getElementById('ws-move-modal').style.display = 'flex';
    },

    confirmMove: function() {
        const sel = this._treeSelection;
        const targetVal = document.getElementById('ws-move-target').value;
        const targetId = targetVal === 'null' ? null : targetVal;
        
        if (sel.val === targetId) return this.closeAllModals();
        
        const success = SystemAPI.moveNode('app_workspace', sel.val, targetId);
        if (success) {
            this.updateDirtyState();
            if (targetId) this._expandedDirs.add(targetId);
            this.renderTree();
            this.renderTabs();
            this.renderPathBar();
            this.closeAllModals();
            if (window.SystemUI) SystemUI.showToast(window.I18nManager ? I18nManager.t('core.sync_success') : "Success");
        }
    },

    handleImportFile: async function() {
        this.closeAllModals();
        
        let parentId = this._treeSelection.val; 
        if (this._treeSelection.type === 'text') {
            const filelist = SystemAPI.getFileList('app_workspace');
            if (filelist[parentId]) parentId = filelist[parentId].parentid;
        }
        
        const success = await SystemAPI.importNode('app_workspace', parentId, 'file');
        if (success) {
            if (window.SystemUI) SystemUI.showToast(window.I18nManager ? I18nManager.t('core.sync_success') : "Imported successfully");
            this.updateDirtyState();
            if (parentId) this._expandedDirs.add(parentId);
            this.renderTree();
        }
    },

    handleImportFolder: async function() {
        this.closeAllModals();
        
        let parentId = this._treeSelection.val; 
        if (this._treeSelection.type === 'text') {
            const filelist = SystemAPI.getFileList('app_workspace');
            if (filelist[parentId]) parentId = filelist[parentId].parentid;
        }
        
        const success = await SystemAPI.importNode('app_workspace', parentId, 'directory');
        if (success) {
            if (window.SystemUI) SystemUI.showToast(window.I18nManager ? I18nManager.t('core.sync_success') : "Imported successfully");
            this.updateDirtyState();
            if (parentId) this._expandedDirs.add(parentId);
            this.renderTree();
        }
    },

    handleExport: async function() {
        this.closeAllModals();
        const success = await SystemAPI.exportNode('app_workspace', this._treeSelection.val);
        if (success) {
            if (window.SystemUI) SystemUI.showToast(window.I18nManager ? I18nManager.t('core.sync_success') : "Exported successfully");
        }
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
        if (this._isDuplicate(meta.parentid, newName, sel.val)) return SystemUI.showToast(window.I18nManager ? I18nManager.t('app_workspace.err_duplicate') : '同名文件已存在');
        
        SystemAPI.renameNode('app_workspace', sel.val, newName);

        this.updateDirtyState(); this.renderTree(); this.renderTabs(); this.renderPathBar();
        
        const inst = this._editorInstances[sel.val];
        if (inst && inst.type === 'monaco') {
            const newLang = this._getLanguage(newName);
            const isTextNode = ['markdown', 'plaintext'].includes(newLang);
            monaco.editor.setModelLanguage(inst.core.getModel(), newLang);
            inst.core.updateOptions({ wordWrap: isTextNode ? 'on' : 'off' });
        }
        
        this.closeAllModals();
    },

    handleHeaderDelete: function() {
        this.closeAllModals();
        const sel = this._treeSelection;
        if (!sel || sel.val === null) return SystemUI.showToast(window.I18nManager ? I18nManager.t('app_workspace.cannot_delete_root') : '不能删除根目录');
        
        const msg = sel.type === 'directory' ? (window.I18nManager ? I18nManager.t('app_workspace.del_folder_confirm') : '确定删除文件夹吗？') : (window.I18nManager ? I18nManager.t('app_workspace.delete_confirm') : '确定删除此文件吗？');
        
        SystemUI.showConfirm(msg, () => {
            SystemAPI.deleteNode('app_workspace', sel.val);
            
            const filelist = SystemAPI.getFileList('app_workspace');
            this._openTabs = this._openTabs.filter(id => {
                const isAlive = filelist[id] && filelist[id].deleted < 0;
                if (!isAlive && this._editorInstances[id]) {
                    const inst = this._editorInstances[id];
                    if (inst.type === 'monaco') inst.core.dispose();
                    if (inst.type === 'vditor') inst.core.destroy();
                    if (inst.wrapper) inst.wrapper.remove(); 
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

    closeAllModals: function() {
        ['ws-add-folder-modal', 'ws-add-file-modal', 'ws-rename-modal', 'ws-move-modal', 'ws-bottom-sheet-modal', 'ws-context-menu'].forEach(id => { 
            const el = document.getElementById(id); 
            if(el) el.style.display = 'none'; 
        });
    },

    onFilesPulled: function(pulledFids) {
        let activeNeedsReload = false;
        
        pulledFids.forEach(fid => {
            if (this._editorInstances[fid]) {
                const inst = this._editorInstances[fid];
                if (inst.type === 'monaco' && typeof inst.core.dispose === 'function') inst.core.dispose();
                if (inst.type === 'vditor' && typeof inst.core.destroy === 'function') inst.core.destroy();
                if (inst.wrapper) inst.wrapper.remove(); 
                delete this._editorInstances[fid];
            }
            if (this._activeId === fid) {
                activeNeedsReload = true;
            }
        });

        if (activeNeedsReload) {
            this.renderEditor();
        }
    },

    forceSyncCloud: async function() {
        const success = await SystemAPI.syncCloud('app_workspace');
        
        if (success) {
            this.updateDirtyState();
            this.renderTree();
            this.renderTabs();
        }
    },

    escape: function(str) { return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s]); }
};