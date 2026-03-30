/**
 * 私有工作区核心 - 双核生产力终极版 (Monaco + Vditor)
 * 【新增】：支持 MD 宽/窄屏一键切换，状态持久化记忆，动态按需显示按钮。
 */

window.AppWorkspace = {
    _activeId: null, _openTabs: [], _treeSelection: { type: 'directory', val: null }, 
    _container: null, _cloudDirtyList: [], _expandedDirs: new Set([null]), _globalClickHandler: null, 
    _editorInstances: {}, _resizeHandler: null, _themeObserver: null,
    
    // ⚡ 新增：从本地缓存读取用户上次设置的宽窄屏偏好
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
        window.addEventListener('click', this._globalClickHandler);
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
                    Object.values(this._editorInstances).forEach(inst => {
                        if (inst.type === 'vditor' && inst.core && typeof inst.core.setTheme === 'function') {
                            inst.core.setTheme(
                                isDark ? 'dark' : 'classic', 
                                isDark ? 'dark' : 'light', 
                                isDark ? 'native' : 'github'
                            );
                        }
                    });
                }
            });
        });
        this._themeObserver.observe(document.documentElement, { attributes: true });
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

    // ⚡ 修改：在顶部工具栏注入宽窄屏切换按钮
    renderTopBar: function() {
        const actionsHTML = `
            <button id="ws-md-width-btn" class="sys-btn ghost" onclick="AppWorkspace.toggleMdWidth()" style="display:none; position:relative;" title="切换宽/窄屏">
                <span class="material-symbols-rounded" id="ws-md-width-icon">${this._isMdWideMode ? 'close_fullscreen' : 'open_in_full'}</span>
            </button>
            <button id="ws-sync-btn" class="sys-btn ghost" onclick="AppWorkspace.forceSyncCloud()" style="display:none; position:relative;">
                <span class="material-symbols-rounded">cloud_sync</span>
                <span data-i18n="app_workspace.btn_sync">同步</span>
                <div id="ws-sync-badge" class="sync-dot-badge" style="display:none;"></div>
            </button>
        `;
        document.getElementById('sys-app-actions').innerHTML = actionsHTML;
        I18nManager.translateDOM(document.getElementById('sys-app-actions'));
        
        // 渲染时立即同步一次按钮状态
        this.updateTopBarActions();
    },

    // ⚡ 新增：处理宽窄屏切换动作
    toggleMdWidth: function() {
        this._isMdWideMode = !this._isMdWideMode;
        localStorage.setItem('ws_md_wide', this._isMdWideMode); // 持久化记忆
        
        this.updateTopBarActions();
    },

    // ⚡ 新增：智能显隐顶部按钮，并动态注入 CSS 类
    updateTopBarActions: function() {
        const mdBtn = document.getElementById('ws-md-width-btn');
        const icon = document.getElementById('ws-md-width-icon');
        const layout = document.getElementById('ws-layout');
        
        // 动态给主布局加上或移除宽屏 class
        if (layout) {
            if (this._isMdWideMode) layout.classList.add('is-md-wide');
            else layout.classList.remove('is-md-wide');
        }

        // 切换图标
        if (icon) {
            icon.innerText = this._isMdWideMode ? 'close_fullscreen' : 'open_in_full';
        }

        if (!mdBtn) return;

        // 如果没有打开任何文件，隐藏按钮
        if (!this._activeId) {
            mdBtn.style.display = 'none';
            return;
        }

        const filelist = SystemAPI.getFileList('app_workspace');
        const meta = filelist[this._activeId];
        if (meta) {
            const lang = this._getLanguage(meta.name);
            // 只有当前文件是 Markdown，才显示切换按钮！
            mdBtn.style.display = (lang === 'markdown') ? 'inline-flex' : 'none';
        } else {
            mdBtn.style.display = 'none';
        }
    },

    unmount: function(container) {
        if (this._globalClickHandler) window.removeEventListener('click', this._globalClickHandler);
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
                            <button class="ws-toolbar-btn" id="btn-new-file" onclick="AppWorkspace.openAddFileModal()" title="新建文件"><span class="material-symbols-rounded">post_add</span></button>
                            <button class="ws-toolbar-btn" id="btn-new-folder" onclick="AppWorkspace.openAddFolderModal()" title="新建文件夹"><span class="material-symbols-rounded">create_new_folder</span></button>
                            <button class="ws-toolbar-btn" id="btn-import" onclick="AppWorkspace.handleImportFolder()" title="导入文件夹"><span class="material-symbols-rounded">drive_folder_upload</span></button>
                        </div>
                        <div style="display: flex; gap: 4px;">
                            <button class="ws-toolbar-btn" id="btn-export" onclick="AppWorkspace.handleExport()" title="导出到本地"><span class="material-symbols-rounded">download</span></button>
                            <button class="ws-toolbar-btn" id="btn-move" onclick="AppWorkspace.openMoveModal()" title="移动"><span class="material-symbols-rounded">drive_file_move</span></button>
                            <button class="ws-toolbar-btn" id="btn-rename" onclick="AppWorkspace.openRenameModal()" title="重命名"><span class="material-symbols-rounded">edit_square</span></button>
                            <button class="ws-toolbar-btn danger" id="btn-delete" onclick="AppWorkspace.handleHeaderDelete()" title="删除"><span class="material-symbols-rounded">delete</span></button>
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

            <div id="ws-add-folder-modal" class="sys-modal-overlay" style="display:none;" onclick="AppWorkspace.closeAllModals(event)">
                <div class="sys-modal" onclick="event.stopPropagation()">
                    <h3 data-i18n="app_workspace.new_folder">新建文件夹</h3>
                    <label data-i18n="app_workspace.folder_name" style="margin-top: 8px;">名称</label>
                    <input type="text" id="ws-new-folder-input" class="sys-input" placeholder="..." autocomplete="off">
                    <div class="modal-actions" style="margin-top: 24px;">
                        <button class="sys-btn ghost" onclick="AppWorkspace.closeAllModals()" data-i18n="core.cancel">取消</button>
                        <button class="sys-btn primary" onclick="AppWorkspace.confirmAddFolder()" data-i18n="app_workspace.create">创建</button>
                    </div>
                </div>
            </div>

            <div id="ws-add-file-modal" class="sys-modal-overlay" style="display:none;" onclick="AppWorkspace.closeAllModals(event)">
                <div class="sys-modal" onclick="event.stopPropagation()">
                    <h3 data-i18n="app_workspace.new_note">新建文件</h3>
                    <label data-i18n="app_workspace.file_name" style="margin-top: 8px;">名称</label>
                    <div style="display:flex; gap:8px;">
                        <input type="text" id="ws-new-file-name" class="sys-input" style="flex:1; margin-bottom:0;" autocomplete="off">
                        <select id="ws-new-file-ext" class="sys-input" style="width: 95px; margin-bottom:0; padding: 16px 12px;">
                            <option value=".md">.md</option>
                            <option value=".js">.js</option>
                            <option value=".cpp">.cpp</option>
                            <option value=".c">.c</option>
                            <option value=".py">.py</option>
                            <option value=".json">.json</option>
                            <option value=".css">.css</option>
                            <option value=".html">.html</option>
                            <option value=".txt">.txt</option>
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
                    <h3 data-i18n="app_workspace.rename">重命名</h3>
                    <label data-i18n="app_workspace.new_name" style="margin-top: 8px;">新名称</label>
                    <input type="text" id="ws-rename-input" class="sys-input" autocomplete="off">
                    <div class="modal-actions" style="margin-top: 24px;">
                        <button class="sys-btn ghost" onclick="AppWorkspace.closeAllModals()" data-i18n="core.cancel">取消</button>
                        <button class="sys-btn primary" onclick="AppWorkspace.confirmRename()" data-i18n="app_workspace.confirm">确定</button>
                    </div>
                </div>
            </div>

            <div id="ws-move-modal" class="sys-modal-overlay" style="display:none;" onclick="AppWorkspace.closeAllModals(event)">
                <div class="sys-modal" onclick="event.stopPropagation()">
                    <h3 data-i18n="app_workspace.move">移动到</h3>
                    <label data-i18n="app_workspace.target_folder" style="margin-top: 8px;">选择目标目录</label>
                    <select id="ws-move-target" class="sys-input" style="padding: 12px; margin-bottom: 0;"></select>
                    <div class="modal-actions" style="margin-top: 24px;">
                        <button class="sys-btn ghost" onclick="AppWorkspace.closeAllModals()" data-i18n="core.cancel">取消</button>
                        <button class="sys-btn primary" onclick="AppWorkspace.confirmMove()" data-i18n="app_workspace.confirm">确定</button>
                    </div>
                </div>
            </div>

            <div id="ws-bottom-sheet-modal" class="ws-bottom-sheet-overlay" onclick="AppWorkspace.closeAllModals(event)">
                <div class="ws-bottom-sheet" onclick="event.stopPropagation()">
                    <div id="ws-sheet-title" class="ws-bottom-sheet-title"></div>
                    <button id="ws-sheet-open" class="ws-sheet-btn primary" onclick="AppWorkspace.openFileFromMobile()"><span class="material-symbols-rounded">menu_open</span><span data-i18n="app_workspace.open_file"></span></button>
                    <button id="ws-sheet-new-file" class="ws-sheet-btn" onclick="AppWorkspace.openAddFileModal()"><span class="material-symbols-rounded">post_add</span><span data-i18n="app_workspace.new_note"></span></button>
                    <button id="ws-sheet-new-folder" class="ws-sheet-btn" onclick="AppWorkspace.openAddFolderModal()"><span class="material-symbols-rounded">create_new_folder</span><span data-i18n="app_workspace.new_folder"></span></button>
                    <button id="ws-sheet-import" class="ws-sheet-btn" onclick="AppWorkspace.handleImportFolder()"><span class="material-symbols-rounded">drive_folder_upload</span><span data-i18n="app_workspace.import"></span></button>
                    <button id="ws-sheet-export" class="ws-sheet-btn" onclick="AppWorkspace.handleExport()"><span class="material-symbols-rounded">download</span><span data-i18n="app_workspace.export"></span></button>
                    <button id="ws-sheet-move" class="ws-sheet-btn" onclick="AppWorkspace.openMoveModal()"><span class="material-symbols-rounded">drive_file_move</span><span data-i18n="app_workspace.move"></span></button>
                    <button id="ws-sheet-rename" class="ws-sheet-btn" onclick="AppWorkspace.openRenameModal()"><span class="material-symbols-rounded">edit_square</span><span data-i18n="app_workspace.rename"></span></button>
                    <button id="ws-sheet-delete" class="ws-sheet-btn danger" onclick="AppWorkspace.handleHeaderDelete()"><span class="material-symbols-rounded">delete</span><span data-i18n="app_workspace.delete"></span></button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalsHTML);
        I18nManager.translateDOM(this._container);
        I18nManager.translateDOM(document.getElementById('ws-add-folder-modal'));
        I18nManager.translateDOM(document.getElementById('ws-add-file-modal'));
        I18nManager.translateDOM(document.getElementById('ws-rename-modal'));
        I18nManager.translateDOM(document.getElementById('ws-move-modal'));
        I18nManager.translateDOM(document.getElementById('ws-bottom-sheet-modal'));

        this.updateToolbarState();
    },

    showContextMenu: function(e, type, val) {
        e.preventDefault(); e.stopPropagation();

        if (type === 'directory') this.clickFolder(null, val);
        else this.selectNode(null, type, val);

        const menu = document.getElementById('ws-context-menu');
        if (!menu) return;

        const isRoot = (val === null);
        let html = '';

        if (type === 'directory') {
            html += `<div class="ws-context-menu-item" onclick="AppWorkspace.openAddFileModal()"><span class="material-symbols-rounded">post_add</span><span data-i18n="app_workspace.new_note"></span></div>`;
            html += `<div class="ws-context-menu-item" onclick="AppWorkspace.openAddFolderModal()"><span class="material-symbols-rounded">create_new_folder</span><span data-i18n="app_workspace.new_folder"></span></div>`;
            html += `<div class="ws-context-menu-divider"></div>`;
            html += `<div class="ws-context-menu-item" onclick="AppWorkspace.handleImportFolder()"><span class="material-symbols-rounded">drive_folder_upload</span><span data-i18n="app_workspace.import"></span></div>`;
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
        I18nManager.translateDOM(menu);
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
            path.unshift(this.escape(filelist[curr].name) || I18nManager.t('app_workspace.untitled'));
            curr = filelist[curr].parentid;
        }
        return path.join(' / ');
    },

    buildTreeData: function() {
        const filelist = SystemAPI.getFileList('app_workspace');
        const tree = { id: null, name: I18nManager.t('app_workspace.driver_root') || '/', type: 'directory', children: [] };
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
            html += `
                <div class="ws-tree-item file ${isSelected ? 'active' : ''}" style="padding-left: ${indent}px;" onclick="AppWorkspace.selectNode(event, 'text', '${node.id}')" oncontextmenu="AppWorkspace.showContextMenu(event, 'text', '${node.id}')">
                    <span class="ws-tree-chevron-placeholder"></span>
                    <span class="material-symbols-rounded ws-tree-icon">description</span>
                    <span class="ws-tree-name">${this.escape(node.name) || I18nManager.t('app_workspace.untitled')}${isDirty ? '<span class="ws-dirty-dot"></span>' : ''}</span>
                </div>
            `;
        }
        return html;
    },

    clickFolder: function(e, folderId) {
        if (e) e.stopPropagation();
        const contextMenu = document.getElementById('ws-context-menu');
        if (contextMenu) contextMenu.style.display = 'none';

        this._treeSelection = { type: 'directory', val: folderId };
        
        if (folderId !== null) {
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
            tabsBar.innerHTML = ''; dropdownMenu.innerHTML = `<div style="padding: 12px 20px; color: var(--sys-text-muted); font-size: 0.85rem;">No open files</div>`; return;
        }

        const filelist = SystemAPI.getFileList('app_workspace');
        let tabsHtml = ''; let dropHtml = '';
        this._openTabs.forEach(fileId => {
            const meta = filelist[fileId];
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
    
    _getLanguage: function(fileName) {
        if (!fileName) return 'plaintext';
        const ext = fileName.split('.').pop().toLowerCase();
        const map = {
            'js': 'javascript', 'json': 'json', 'md': 'markdown', 'html': 'html',
            'css': 'css', 'cpp': 'cpp', 'c': 'c', 'py': 'python', 'java': 'java',
            'ts': 'typescript', 'txt': 'plaintext', 'xml': 'xml', 'yaml': 'yaml', 'sql': 'sql'
        };
        return map[ext] || 'plaintext';
    },

    async renderEditor() {
        if (!this._activeId || !this._openTabs.includes(this._activeId)) {
            document.getElementById('ws-editor').classList.remove('active');
            document.getElementById('ws-empty').style.display = 'flex';
            this.renderPathBar();
            this.updateTopBarActions(); // ⚡ 更新按钮状态
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
        
        if (!inst) {
            const content = await SystemAPI.readFile('app_workspace', this._activeId);
            const strContent = content || "";
            const meta = filelist[this._activeId];
            const lang = this._getLanguage(meta.name);
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
            
            if (lang === 'markdown') {
                await SystemCore.loadVditor(); 
                
                const vContainer = document.createElement('div');
                vContainer.id = `vditor-host-${this._activeId}`;
                wrapper.appendChild(vContainer);
                
                const vditorCore = await new Promise(resolve => {
                    const v = new window.Vditor(vContainer.id, {
                        value: strContent,
                        mode: 'ir', 
                        height: '100%', 
                        width: '100%',
                        cache: { enable: false }, 
                        cdn: 'libs/vditor', 
                        theme: isDark ? 'dark' : 'classic',
                        icon: 'material',
                        outline: { enable: false, position: 'left' }, 
                        
                        preview: {
                            theme: { current: isDark ? 'dark' : 'light' },
                            hljs: { style: isDark ? 'native' : 'github' }
                        },

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
                    value: strContent,
                    language: lang,
                    theme: isDark ? 'vs-dark' : 'vs',
                    automaticLayout: true,
                    wordWrap: lang === 'plaintext' ? 'on' : 'off',
                    minimap: { enabled: false }, 
                    fontSize: 14,
                    fontFamily: "'Consolas', 'Courier New', monospace",
                    scrollBeyondLastLine: false,
                    roundedSelection: false,
                    padding: { top: 16 }
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
        
        setTimeout(() => { 
            if (inst.type === 'monaco' && inst.core) {
                inst.core.layout(); 
                if (inst._savedViewState) inst.core.restoreViewState(inst._savedViewState);
                inst.core.focus();
            } else if (inst.type === 'vditor' && inst.core) {
                inst.core.focus();
            }
        }, 50);

        // ⚡ 每次渲染编辑器时，更新顶部按钮的显隐状态
        this.updateTopBarActions();
    },

    selectNode: function(e, type, val) {
        if (e) e.stopPropagation();
        
        const contextMenu = document.getElementById('ws-context-menu');
        if (contextMenu) contextMenu.style.display = 'none';

        if (type === 'text' && this._activeId !== val) this.saveCurrentEditorState();

        this._treeSelection = { type, val };
        const isMobile = window.innerWidth <= 768;

        if (type === 'directory') { 
            if (val === null) {
            } else {
                if(val !== null) this._expandedDirs.add(val); 
            }
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
        const name = val === null ? (I18nManager.t('app_workspace.driver_root') || '/') : (filelist[val] ? filelist[val].name : 'Unknown');

        document.getElementById('ws-sheet-title').innerText = name;

        document.getElementById('ws-sheet-open').style.display = type === 'text' ? 'flex' : 'none';
        
        document.getElementById('ws-sheet-new-file').style.display = 'flex';
        document.getElementById('ws-sheet-new-folder').style.display = 'flex';
        document.getElementById('ws-sheet-import').style.display = 'flex';
        document.getElementById('ws-sheet-export').style.display = 'flex';
        
        document.getElementById('ws-sheet-move').style.display = val !== null ? 'flex' : 'none';
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
        
        let parentId = this._treeSelection.val; 
        if (this._treeSelection.type === 'text') {
            const filelist = SystemAPI.getFileList('app_workspace');
            if (filelist[parentId]) parentId = filelist[parentId].parentid;
        }

        if (this._isDuplicate(parentId, fullName)) return SystemUI.showToast(I18nManager.t('app_workspace.err_duplicate') || '同名文件已存在');

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
        let parentId = this._treeSelection.val; 
        if (this._treeSelection.type === 'text') {
            const filelist = SystemAPI.getFileList('app_workspace');
            if (filelist[parentId]) parentId = filelist[parentId].parentid;
        }
        
        let name = document.getElementById('ws-new-folder-input').value.trim();
        if (!name) return;
        
        if (this._isDuplicate(parentId, name)) return SystemUI.showToast(I18nManager.t('app_workspace.err_duplicate') || '同名文件夹已存在');

        const folderId = await SystemAPI.createDirectory('app_workspace', name, parentId);
        this.updateDirtyState();
        if(parentId) this._expandedDirs.add(parentId); 
        this.selectNode(null, 'directory', folderId);
        
        this.closeAllModals(); document.getElementById('ws-new-folder-input').value = '';
    },

    openMoveModal: function() {
        this.closeAllModals();
        const sel = this._treeSelection;
        if (!sel || sel.val === null) return SystemUI.showToast(I18nManager.t('app_workspace.cannot_move_root') || '不能移动根目录');
        
        const filelist = SystemAPI.getFileList('app_workspace');
        const selectEl = document.getElementById('ws-move-target');
        selectEl.innerHTML = `<option value="null">/ (${I18nManager.t('app_workspace.driver_root') || 'Root'})</option>`;
        
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
            SystemUI.showToast("移动成功");
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
            SystemUI.showToast("文件夹导入成功");
            this.updateDirtyState();
            if (parentId) this._expandedDirs.add(parentId);
            this.renderTree();
        }
    },

    handleExport: async function() {
        this.closeAllModals();
        const success = await SystemAPI.exportNode('app_workspace', this._treeSelection.val);
        if (success) {
            SystemUI.showToast("文件树导出成功");
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
        if (this._isDuplicate(meta.parentid, newName, sel.val)) return SystemUI.showToast(I18nManager.t('app_workspace.err_duplicate') || '同名文件已存在');
        
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
        if (!sel || sel.val === null) return SystemUI.showToast(I18nManager.t('app_workspace.cannot_delete_root') || '不能删除根目录');
        
        const msg = sel.type === 'directory' ? (I18nManager.t('app_workspace.del_folder_confirm') || '确定删除文件夹吗？') : (I18nManager.t('app_workspace.delete_confirm') || '确定删除此文件吗？');
        
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

    closeAllModals: function(e) {
        if (e && !e.target.id.includes('-modal') && e.target.tagName !== 'BUTTON') return;
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