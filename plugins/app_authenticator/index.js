window.AppAuthenticator = {
    _accounts: [], _dataFileId: null, _container: null,
    _updateTimer: null, _saveTimer: null, _pasteHandler: null,
    _libLoaded: false, _cloudDirtyList: [], 
    _categories: [], _currentCat: 'ALL',
    _contextMenuData: null, _globalClickHandler: null, _resizeHandler: null,
    _currentSecretId: null, // 临时保存正处于查看状态的账号ID

    mount: async function(container) {
        this._container = container;
        container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--sys-text-muted);">${I18nManager.t('app_authenticator.loading_component') || '正在注入安全组件...'}</div>`;
        
        if (!this._libLoaded) {
            try {
                await SystemCore.loadLibrary('script', 'buffer.js');
                await SystemCore.loadLibrary('script', 'otplib.js');
                await SystemCore.loadLibrary('script', 'jsQR.js');
                this._libLoaded = true;
            } catch(e) {
                container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--sys-danger);">${I18nManager.t('app_authenticator.load_failed') || '组件加载失败: 缺少依赖文件'}</div>`;
                return;
            }
        }

        await SystemAPI.initPluginFS('app_authenticator');
        await this.loadData();
        this.updateDirtyState();
        
        this.renderShell();
        this.renderSidebar();
        this.renderList();
        this.startTokenLoop();

        this._pasteHandler = this.handlePaste.bind(this);
        window.addEventListener('paste', this._pasteHandler);
        
        this._globalClickHandler = (e) => {
            const pcMenu = document.getElementById('auth-pc-dropdown');
            if (pcMenu && pcMenu.style.display === 'flex' && !e.target.closest('.auth-cat-more') && !e.target.closest('.auth-icon-btn')) {
                pcMenu.style.display = 'none';
            }
        };
        window.addEventListener('click', this._globalClickHandler);
        
        this._resizeHandler = () => { if (SystemCore._currentPlugin === this) this.updateTopTitle(); };
        window.addEventListener('resize', this._resizeHandler);
    },

    onActivate: function() { this.renderTopBar(); this.checkSyncState(); this.updateSyncBadge(); },
    onDeactivate: function() { this.closeAllModals(); },

    renderTopBar: function() {
        const actionsHTML = `
            <button id="auth-sync-btn" class="sys-btn ghost" onclick="AppAuthenticator.forceSyncCloud()" style="display:none; position:relative;">
                <span class="material-symbols-rounded">cloud_sync</span>
                <span data-i18n="app_authenticator.btn_sync"></span>
                <div id="auth-sync-badge" class="sync-dot-badge" style="display:none;"></div>
            </button>
            <button class="sys-btn primary auth-top-add-btn" onclick="AppAuthenticator.openAddAccountModal()">
                <span class="material-symbols-rounded">add</span>
                <span data-i18n="app_authenticator.add_account"></span>
            </button>
        `;
        const sysActions = document.getElementById('sys-app-actions');
        if (sysActions) {
            sysActions.innerHTML = actionsHTML;
            I18nManager.translateDOM(sysActions);
        }
        
        this.updateTopTitle();
    },

    updateTopTitle: function() {
        const titleEl = document.getElementById('sys-app-title');
        if (!titleEl) return;
        if (window.innerWidth <= 768) {
            const catName = this._currentCat === 'ALL' ? I18nManager.t('app_authenticator.cat_all') : this.escape(this._currentCat);
            titleEl.innerHTML = `<div style="display:flex; align-items:center; gap:2px; cursor:pointer;" onclick="AppAuthenticator.showMobileCatSheet()"><span style="font-size:1.15rem; font-weight:600;">${catName}</span><span class="material-symbols-rounded" style="font-size:1.4rem; margin-top:2px;">arrow_drop_down</span></div>`;
        } else {
            titleEl.innerText = I18nManager.t('app_authenticator.app_name') || '身份验证器';
        }
    },

    unmount: function(container) {
        clearTimeout(this._updateTimer); clearTimeout(this._saveTimer);
        if (this._pasteHandler) window.removeEventListener('paste', this._pasteHandler);
        if (this._globalClickHandler) window.removeEventListener('click', this._globalClickHandler);
        if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
        this.closeAllModals(); this._accounts = []; this._categories = []; container.innerHTML = '';
    },

    updateDirtyState: function() { this._cloudDirtyList = SystemAPI.getCloudDirtyList('app_authenticator'); },
    checkSyncState: function() {
        const st = SystemCore.config.storage || {};
        const btn = document.getElementById('auth-sync-btn');
        if (btn) btn.style.display = (st.github || st.api) ? 'inline-flex' : 'none';
    },
    
    onConfigChange: function() { 
        this.checkSyncState(); 
        this.renderSidebar();
        this.renderList();
        this.updateTopTitle();
    },
    
    updateSyncBadge: function() {
        const hasDirty = this._cloudDirtyList.length > 0;
        const badge = document.getElementById('auth-sync-badge');
        if (badge) badge.style.display = hasDirty ? 'block' : 'none';
    },

    forceSyncCloud: async function() {
        if (this._cloudDirtyList.length === 0) return SystemUI.showToast(I18nManager.t('app_authenticator.sync_up_to_date'));
        if (await SystemAPI.syncCloud('app_authenticator')) { this.updateDirtyState(); this.updateSyncBadge(); this.renderSidebar(); }
    },

    loadData: async function() {
        const filelist = SystemAPI.getFileList('app_authenticator');
        let fileId = Object.keys(filelist).find(id => filelist[id].name === 'data.json' && filelist[id].deleted < 0);
        const defCat = I18nManager.t('app_authenticator.cat_default');

        if (fileId) {
            this._dataFileId = fileId;
            const content = await SystemAPI.readFile('app_authenticator', fileId);
            try { 
                let parsed = content ? JSON.parse(content) : {}; 
                if (Array.isArray(parsed)) { this._accounts = parsed; this._categories = [defCat]; } 
                else { this._accounts = parsed.accounts || []; this._categories = parsed.categories || [defCat]; }
            } catch(e) { this._accounts = []; this._categories = [defCat]; }
        } else {
            this._accounts = []; this._categories = [defCat];
            this._dataFileId = await SystemAPI.createFile('app_authenticator', 'data.json', null, JSON.stringify({accounts: [], categories: this._categories}));
        }
        this._accounts.forEach(a => { if (!a.category) a.category = defCat; });
    },

    triggerSave: function() {
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(async () => {
            const dataToSave = { accounts: this._accounts, categories: this._categories };
            await SystemAPI.writeFile('app_authenticator', this._dataFileId, JSON.stringify(dataToSave));
            this.updateDirtyState(); this.updateSyncBadge(); this.renderSidebar();
        }, 500); 
    },

    renderShell: function() {
        this._container.innerHTML = `
            <div class="auth-layout">
                <div class="auth-sidebar">
                    <div class="auth-sidebar-header">
                        <span data-i18n="app_authenticator.manage_category">分类管理</span>
                        <button class="auth-icon-btn" style="width:28px;height:28px;opacity:0.8;" onclick="AppAuthenticator.openAddCatModal()" title="${I18nManager.t('app_authenticator.new_category')}">
                            <span class="material-symbols-rounded" style="font-size:1.2rem;">add</span>
                        </button>
                    </div>
                    <div class="auth-sidebar-list" id="auth-sidebar-list"></div>
                </div>
                
                <div class="auth-main-wrapper">
                    <div class="auth-grid-scroll">
                        <div id="auth-grid" class="auth-grid"></div>
                        <div id="auth-empty" style="display:none;">
                            <span class="material-symbols-rounded" style="font-size: 4rem; opacity: 0.2; margin-bottom: 16px;">vpn_key</span>
                            <div data-i18n="app_authenticator.empty_state"></div>
                        </div>
                    </div>
                    <button class="auth-fab" onclick="AppAuthenticator.openAddAccountModal()"><span class="material-symbols-rounded">add</span></button>
                </div>
            </div>
            
            <div id="auth-pc-dropdown" class="auth-dropdown-menu"></div>
        `;

        const modalsHTML = `
            <div id="auth-add-modal" class="sys-modal-overlay" style="display:none;" onclick="AppAuthenticator.closeAllModals(event)">
                <div class="sys-modal" onclick="event.stopPropagation()">
                    <h3 data-i18n="app_authenticator.add_account" style="margin-bottom: 24px;"></h3>
                    <button class="sys-btn ghost" style="border: 1px dashed var(--sys-border); margin-bottom: 24px; flex-direction: column; gap: 8px; padding: 24px 12px; height: auto;" onclick="document.getElementById('auth-qr-upload').click()">
                        <span class="material-symbols-rounded" style="font-size: 2.2rem; color: var(--sys-primary);">qr_code_scanner</span>
                        <span data-i18n="app_authenticator.scan_qr" style="font-size: 0.9rem;"></span>
                    </button>
                    <input type="file" id="auth-qr-upload" accept="image/*" style="display: none;" onchange="AppAuthenticator.importFromQR(event)">
                    <div style="display: flex; align-items: center; text-align: center; margin: 16px 0 24px; color: var(--sys-text-muted); font-size: 0.85rem; font-weight: 500;">
                        <span style="flex: 1; border-bottom: 1px solid var(--sys-border); margin-right: 0.8em;"></span><span data-i18n="app_authenticator.or_manual"></span><span style="flex: 1; border-bottom: 1px solid var(--sys-border); margin-left: 0.8em;"></span>
                    </div>
                    <label data-i18n="app_authenticator.category"></label><select id="auth-new-cat" class="sys-input" style="font-weight: 500;"></select>
                    <input type="text" id="auth-new-name" class="sys-input" data-i18n="app_authenticator.account_name" placeholder=" " autocomplete="off">
                    <input type="text" id="auth-new-secret" class="sys-input" data-i18n="app_authenticator.secret_key" placeholder=" " autocomplete="off" style="font-family: monospace;">
                    <div class="modal-actions" style="margin-top: 32px;">
                        <button class="sys-btn ghost" onclick="AppAuthenticator.closeAllModals()" data-i18n="core.cancel"></button>
                        <button class="sys-btn primary" onclick="AppAuthenticator.addAccount()" data-i18n="app_authenticator.btn_save"></button>
                    </div>
                </div>
            </div>

            <div id="auth-cat-input-modal" class="sys-modal-overlay" style="display:none;" onclick="AppAuthenticator.closeAllModals(event)">
                <div class="sys-modal" onclick="event.stopPropagation()">
                    <h3 id="auth-cat-modal-title"></h3>
                    <input type="text" id="auth-cat-input" class="sys-input" data-i18n="app_authenticator.input_cat_name" placeholder="..." autocomplete="off">
                    <div class="modal-actions" style="margin-top: 24px;">
                        <button class="sys-btn ghost" onclick="AppAuthenticator.closeAllModals()" data-i18n="core.cancel"></button>
                        <button class="sys-btn primary" onclick="AppAuthenticator.confirmCatInput()" data-i18n="core.confirm"></button>
                    </div>
                </div>
            </div>

            <div id="auth-secret-modal" class="sys-modal-overlay" style="display:none;" onclick="AppAuthenticator.closeAllModals(event)">
                <div class="sys-modal" onclick="event.stopPropagation()">
                    <h3 data-i18n="app_authenticator.view_secret" style="margin-bottom: 24px;"></h3>
                    <div id="auth-secret-display" style="font-family: monospace; background: var(--sys-surface-hover); padding: 20px; border-radius: 8px; word-break: break-all; margin-bottom: 24px; font-size: 1.2rem; color: var(--sys-primary); text-align: center; letter-spacing: 2px; font-weight: bold;"></div>
                    <div class="modal-actions" style="margin-top: 32px;">
                        <button class="sys-btn ghost" onclick="AppAuthenticator.closeAllModals()" data-i18n="core.cancel"></button>
                        <button class="sys-btn primary" onclick="AppAuthenticator.copySecret()">复制 / Copy</button>
                    </div>
                </div>
            </div>
            
            <div id="auth-bottom-sheet" class="auth-bottom-sheet-overlay" onclick="AppAuthenticator.closeAllModals(event)">
                <div class="auth-bottom-sheet" onclick="event.stopPropagation()">
                    <div id="auth-bs-title" class="auth-bs-title"></div>
                    <div id="auth-bs-content" style="display:flex; flex-direction:column; gap:4px;"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalsHTML);
        I18nManager.translateDOM(this._container);
        I18nManager.translateDOM(document.getElementById('auth-add-modal'));
        I18nManager.translateDOM(document.getElementById('auth-cat-input-modal'));
        I18nManager.translateDOM(document.getElementById('auth-secret-modal')); // ⚡ 初始化弹窗翻译
        this.checkSyncState();
    },

    _ensureCategories: function() {
        const defCat = I18nManager.t('app_authenticator.cat_default');
        const allDefCats = [];
        const dicts = I18nManager.pluginDicts['app_authenticator'];
        if (dicts) {
            Object.values(dicts).forEach(langDict => {
                if (langDict['cat_default']) {
                    allDefCats.push(langDict['cat_default']);
                }
            });
        }

        this._accounts.forEach(a => {
            if (!a.category || allDefCats.includes(a.category)) {
                a.category = defCat;
            }
        });

        const usedCats = this._accounts.map(a => a.category).filter(c => c && c.trim() !== '');
        let allCats = [...new Set([...(this._categories || []), ...usedCats])];
        allCats = allCats.filter(c => !allDefCats.includes(c));
        allCats.unshift(defCat);
        
        this._categories = allCats;

        if (allDefCats.includes(this._currentCat)) {
            this._currentCat = defCat;
        }
    },

    renderSidebar: function() {
        this._ensureCategories();
        const listEl = document.getElementById('auth-sidebar-list');
        if (!listEl) return;
        
        let html = `
            <div class="auth-cat-item ${this._currentCat === 'ALL' ? 'active' : ''}" onclick="AppAuthenticator.switchTab('ALL')">
                <span class="material-symbols-rounded auth-cat-icon">view_cozy</span>
                <span class="auth-cat-name">${I18nManager.t('app_authenticator.cat_all')}</span>
                <span class="auth-cat-count">${this._accounts.length}</span>
            </div>
        `;
        
        const defCat = I18nManager.t('app_authenticator.cat_default');
        this._categories.forEach(cat => {
            const count = this._accounts.filter(a => a.category === cat).length;
            const icon = cat === defCat ? 'inventory_2' : 'folder';
            html += `
                <div class="auth-cat-item ${this._currentCat === cat ? 'active' : ''}" onclick="AppAuthenticator.switchTab('${this.escape(cat)}')">
                    <span class="material-symbols-rounded auth-cat-icon">${icon}</span>
                    <span class="auth-cat-name">${this.escape(cat)}</span>
                    <span class="auth-cat-count">${count}</span>
                    ${cat !== defCat ? `<button class="auth-cat-more" onclick="AppAuthenticator.showCatMenu(event, '${this.escape(cat)}')"><span class="material-symbols-rounded" style="font-size:1.1rem;">more_horiz</span></button>` : ''}
                </div>
            `;
        });
        listEl.innerHTML = html;
    },

    switchTab: function(catName) {
        if (this._currentCat === catName) return;
        this._currentCat = catName;
        this.renderSidebar(); this.renderList();
        
        this.updateTopTitle();
    },

    showCatMenu: function(e, catName) {
        e.stopPropagation();
        if (window.innerWidth <= 768) {
            document.getElementById('auth-bs-title').innerText = catName;
            document.getElementById('auth-bs-content').innerHTML = `
                <button class="auth-bs-btn" onclick="AppAuthenticator.openRenameCatModal('${this.escape(catName)}')">
                    <div class="left"><span class="material-symbols-rounded">edit_square</span> <span>${I18nManager.t('app_authenticator.rename_cat')}</span></div>
                </button>
                <button class="auth-bs-btn danger" onclick="AppAuthenticator.deleteCategory('${this.escape(catName)}')">
                    <div class="left"><span class="material-symbols-rounded">delete</span> <span>${I18nManager.t('app_authenticator.delete_cat')}</span></div>
                </button>
            `;
            document.getElementById('auth-bottom-sheet').style.display = 'flex';
        } else {
            const menu = document.getElementById('auth-pc-dropdown');
            menu.innerHTML = `
                <div class="auth-dropdown-item" onclick="AppAuthenticator.openRenameCatModal('${this.escape(catName)}')"><span class="material-symbols-rounded">edit_square</span> ${I18nManager.t('app_authenticator.rename_cat')}</div>
                <div class="auth-dropdown-item danger" onclick="AppAuthenticator.deleteCategory('${this.escape(catName)}')"><span class="material-symbols-rounded">delete</span> ${I18nManager.t('core.delete')}</div>
            `;
            const rect = e.currentTarget.getBoundingClientRect();
            menu.style.top = `${rect.bottom + 4}px`; menu.style.left = `${rect.left}px`;
            menu.style.display = 'flex';
        }
    },

    showMobileCatSheet: function() {
        document.getElementById('auth-bs-title').innerText = I18nManager.t('app_authenticator.category');
        let html = `
            <button class="auth-bs-btn ${this._currentCat === 'ALL' ? 'active' : ''}" onclick="AppAuthenticator.switchTab('ALL'); AppAuthenticator.closeAllModals();">
                <div class="left"><span class="material-symbols-rounded">view_cozy</span> <span>${I18nManager.t('app_authenticator.cat_all')}</span></div>
                <span style="color:var(--sys-text-muted);font-size:0.85rem;">${this._accounts.length}</span>
            </button>
        `;
        const defCat = I18nManager.t('app_authenticator.cat_default');
        this._categories.forEach(cat => {
            const count = this._accounts.filter(a => a.category === cat).length;
            const icon = cat === defCat ? 'inventory_2' : 'folder';
            html += `
                <button class="auth-bs-btn ${this._currentCat === cat ? 'active' : ''}" onclick="AppAuthenticator.switchTab('${this.escape(cat)}'); AppAuthenticator.closeAllModals();">
                    <div class="left"><span class="material-symbols-rounded">${icon}</span> <span>${this.escape(cat)}</span></div>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span style="color:var(--sys-text-muted);font-size:0.85rem;">${count}</span>
                        ${cat !== defCat ? `<span class="material-symbols-rounded" style="font-size:1.2rem; color:var(--sys-text-muted);" onclick="event.stopPropagation(); AppAuthenticator.showCatMenu(event, '${this.escape(cat)}')">more_vert</span>` : ''}
                    </div>
                </button>
            `;
        });
        html += `
            <div style="margin: 8px 0; border-bottom: 1px solid var(--sys-border);"></div>
            <button class="auth-bs-btn" style="color:var(--sys-primary);" onclick="AppAuthenticator.openAddCatModal()">
                <div class="left"><span class="material-symbols-rounded" style="color:var(--sys-primary);">add</span> <span>${I18nManager.t('app_authenticator.new_category')}</span></div>
            </button>
        `;
        document.getElementById('auth-bs-content').innerHTML = html;
        document.getElementById('auth-bottom-sheet').style.display = 'flex';
    },

    openAddCatModal: function() {
        this.closeAllModals(); this._contextMenuData = { mode: 'add' };
        document.getElementById('auth-cat-modal-title').innerText = I18nManager.t('app_authenticator.new_category');
        const input = document.getElementById('auth-cat-input'); input.value = '';
        document.getElementById('auth-cat-input-modal').style.display = 'flex'; input.focus();
    },

    openRenameCatModal: function(oldName) {
        this.closeAllModals(); this._contextMenuData = { mode: 'rename', oldName };
        document.getElementById('auth-cat-modal-title').innerText = I18nManager.t('app_authenticator.rename_cat');
        const input = document.getElementById('auth-cat-input'); input.value = oldName;
        document.getElementById('auth-cat-input-modal').style.display = 'flex'; input.focus();
    },

    confirmCatInput: function() {
        const val = document.getElementById('auth-cat-input').value.trim();
        if (!val) return;
        if (this._categories.includes(val) && (this._contextMenuData.mode === 'add' || val !== this._contextMenuData.oldName)) {
            return SystemUI.showToast(I18nManager.t('app_authenticator.err_cat_exists'));
        }
        
        if (this._contextMenuData.mode === 'add') {
            this._categories.push(val);
        } else if (this._contextMenuData.mode === 'rename') {
            const idx = this._categories.indexOf(this._contextMenuData.oldName);
            if (idx > -1) this._categories[idx] = val;
            this._accounts.forEach(a => { if(a.category === this._contextMenuData.oldName) a.category = val; });
            if (this._currentCat === this._contextMenuData.oldName) this._currentCat = val;
        }
        this.triggerSave(); this.renderSidebar(); this.renderList(); this.updateTopTitle(); this.closeAllModals();
    },

    deleteCategory: function(catName) {
        this.closeAllModals();
        let msg = I18nManager.t('app_authenticator.del_cat_confirm');
        msg = msg.replace('{0}', catName);
        SystemUI.showConfirm(msg, () => {
            this._categories = this._categories.filter(c => c !== catName);
            const defCat = I18nManager.t('app_authenticator.cat_default');
            this._accounts.forEach(a => { if(a.category === catName) a.category = defCat; });
            if (this._currentCat === catName) this._currentCat = 'ALL';
            this.triggerSave(); this.renderSidebar(); this.renderList(); this.updateTopTitle();
        });
    },

    showAccountMenu: function(e, id) {
        e.stopPropagation();
        const acc = this._accounts.find(a => a.id === id); if (!acc) return;
        
        if (window.innerWidth <= 768) {
            document.getElementById('auth-bs-title').innerText = acc.name;
            let html = `<div style="padding: 4px 16px; font-size: 0.85rem; color: var(--sys-text-muted); font-weight: 500;">${I18nManager.t('app_authenticator.move_to')}</div>`;
            this._categories.forEach(cat => {
                if (cat !== acc.category) {
                    const icon = cat === I18nManager.t('app_authenticator.cat_default') ? 'inventory_2' : 'folder';
                    html += `
                        <button class="auth-bs-btn" onclick="AppAuthenticator.moveToCat('${id}', '${this.escape(cat)}')">
                            <div class="left"><span class="material-symbols-rounded">${icon}</span> <span>${this.escape(cat)}</span></div>
                        </button>
                    `;
                }
            });
            // ⚡ 添加：查看密钥按钮
            html += `
                <div style="margin: 8px 0; border-bottom: 1px solid var(--sys-border);"></div>
                <button class="auth-bs-btn" onclick="AppAuthenticator.openSecretModal('${id}')">
                    <div class="left"><span class="material-symbols-rounded">visibility</span> <span>${I18nManager.t('app_authenticator.view_secret')}</span></div>
                </button>
                <button class="auth-bs-btn danger" onclick="AppAuthenticator.deleteAccount('${id}')">
                    <div class="left"><span class="material-symbols-rounded">delete</span> <span>${I18nManager.t('core.delete')}</span></div>
                </button>
            `;
            document.getElementById('auth-bs-content').innerHTML = html;
            document.getElementById('auth-bottom-sheet').style.display = 'flex';
        } else {
            const menu = document.getElementById('auth-pc-dropdown');
            let html = ``;
            this._categories.forEach(cat => {
                if (cat !== acc.category) {
                    html += `<div class="auth-dropdown-item" onclick="AppAuthenticator.moveToCat('${id}', '${this.escape(cat)}')"><span class="material-symbols-rounded" style="font-size:1.1rem; opacity:0.7;">folder_open</span> ${I18nManager.t('app_authenticator.move_to')} ${this.escape(cat)}</div>`;
                }
            });
            // ⚡ 添加：查看密钥按钮
            html += `<div style="height:1px; background:var(--sys-border); margin:4px 0;"></div>`;
            html += `<div class="auth-dropdown-item" onclick="AppAuthenticator.openSecretModal('${id}')"><span class="material-symbols-rounded" style="font-size:1.1rem;">visibility</span> ${I18nManager.t('app_authenticator.view_secret')}</div>`;
            html += `<div class="auth-dropdown-item danger" onclick="AppAuthenticator.deleteAccount('${id}')"><span class="material-symbols-rounded" style="font-size:1.1rem;">delete</span> ${I18nManager.t('core.delete')}</div>`;
            
            menu.innerHTML = html;
            const rect = e.currentTarget.getBoundingClientRect();
            menu.style.top = `${rect.bottom + 4}px`; menu.style.left = `${rect.left - 100}px`;
            menu.style.display = 'flex';
        }
    },

    moveToCat: function(id, catName) {
        const acc = this._accounts.find(a => a.id === id);
        if (acc) { acc.category = catName; this.triggerSave(); this.renderSidebar(); this.renderList(); }
        this.closeAllModals();
    },

    renderList: function() {
        const gridEl = document.getElementById('auth-grid');
        const emptyEl = document.getElementById('auth-empty');
        
        const filteredAccounts = this._currentCat === 'ALL' 
            ? this._accounts 
            : this._accounts.filter(a => a.category === this._currentCat);

        if (filteredAccounts.length === 0) { gridEl.innerHTML = ''; emptyEl.style.display = 'flex'; return; }
        
        emptyEl.style.display = 'none';
        gridEl.innerHTML = filteredAccounts.map(acc => `
            <div class="auth-card" id="card-${acc.id}">
                <div class="auth-card-header">
                    <div class="auth-card-name">${this.escape(acc.name)}</div>
                    <button class="auth-icon-btn" onclick="AppAuthenticator.showAccountMenu(event, '${acc.id}')">
                        <span class="material-symbols-rounded">more_vert</span>
                    </button>
                </div>
                <div class="auth-card-row">
                    <div class="auth-code" id="code-${acc.id}" title="点击复制" onclick="AppAuthenticator.copyCode('${acc.id}')">------</div>
                    <div class="auth-progress">
                        <svg class="auth-circle-svg" viewBox="0 0 40 40">
                            <circle class="auth-circle-bg" cx="20" cy="20" r="16"></circle>
                            <circle class="auth-circle-bar" id="circle-${acc.id}" cx="20" cy="20" r="16"></circle>
                        </svg>
                    </div>
                </div>
            </div>
        `).join('');
        this.updateTokens();
    },

    openAddAccountModal: function() {
        this._ensureCategories();
        const modal = document.getElementById('auth-add-modal');
        if(modal) {
            const selectEl = document.getElementById('auth-new-cat');
            selectEl.innerHTML = this._categories.map(c => `<option value="${this.escape(c)}">${this.escape(c)}</option>`).join('');
            selectEl.value = this._currentCat === 'ALL' ? I18nManager.t('app_authenticator.cat_default') : this._currentCat;
            document.getElementById('auth-new-name').value = '';
            document.getElementById('auth-new-secret').value = '';
            modal.style.display = 'flex';
        }
    },

    addAccount: function() {
        const name = document.getElementById('auth-new-name').value.trim();
        const secret = document.getElementById('auth-new-secret').value.trim().replace(/[^a-zA-Z2-7]/g, '').toUpperCase();
        const cat = document.getElementById('auth-new-cat').value;
        
        if (!name || !secret) return SystemUI.showToast(I18nManager.t('app_authenticator.err_incomplete'));
        try { otplib.authenticator.generate(secret); } catch (e) { return SystemUI.showToast(I18nManager.t('app_authenticator.err_format')); }
        if (this._accounts.some(acc => acc.secret === secret)) return SystemUI.showToast(I18nManager.t('app_authenticator.err_exists'));

        this._accounts.push({ id: 'acc_' + Date.now(), name, secret, category: cat });
        this.triggerSave();
        
        if (this._currentCat !== 'ALL' && this._currentCat !== cat) this._currentCat = 'ALL';
        
        this.renderSidebar(); this.renderList(); this.updateTopTitle(); this.closeAllModals();
    },

    deleteAccount: function(id) {
        this.closeAllModals();
        SystemUI.showConfirm(I18nManager.t('app_authenticator.delete_confirm'), () => {
            this._accounts = this._accounts.filter(a => a.id !== id);
            this.triggerSave(); this.renderSidebar(); this.renderList();
        });
    },

    copyCode: function(id) {
        const acc = this._accounts.find(a => a.id === id); if (!acc) return;
        try {
            const code = otplib.authenticator.generate(acc.secret);
            navigator.clipboard.writeText(code).then(() => SystemUI.showToast(I18nManager.t('app_authenticator.copy_success')));
        } catch (e) { SystemUI.showToast(I18nManager.t('app_authenticator.copy_failed')); }
    },

    // ⚡ 新增的：打开密钥弹窗
    openSecretModal: function(id) {
        this.closeAllModals();
        const acc = this._accounts.find(a => a.id === id);
        if (!acc) return;
        this._currentSecretId = id; 
        document.getElementById('auth-secret-display').innerText = acc.secret;
        document.getElementById('auth-secret-modal').style.display = 'flex';
    },

    // ⚡ 新增的：复制密钥功能
    copySecret: function() {
        if (!this._currentSecretId) return;
        const acc = this._accounts.find(a => a.id === this._currentSecretId);
        if (!acc) return;
        navigator.clipboard.writeText(acc.secret).then(() => {
            SystemUI.showToast(I18nManager.t('app_authenticator.copy_secret_success') || '已复制');
            this.closeAllModals();
        }).catch(() => {
            SystemUI.showToast(I18nManager.t('app_authenticator.copy_failed') || '复制失败');
        });
    },

    updateTokens: function() {
        if (this._accounts.length === 0) return;
        const seconds = Math.floor(Date.now() / 1000) % 30; 
        const dashoffset = (seconds / 30) * 100.53;
        const isWarning = seconds >= 25; 

        this._accounts.forEach(acc => {
            const codeEl = document.getElementById(`code-${acc.id}`);
            const circleEl = document.getElementById(`circle-${acc.id}`);
            if (!codeEl || !circleEl) return;

            try {
                const code = otplib.authenticator.generate(acc.secret);
                const formatted = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
                if (codeEl.innerText !== formatted) codeEl.innerText = formatted;
            } catch(e) { codeEl.innerText = "ERROR"; }

            if (seconds === 0) circleEl.style.transition = 'none';
            else if (seconds === 1) circleEl.style.transition = 'stroke-dashoffset 1s linear, stroke 0.3s';
            
            circleEl.style.strokeDashoffset = dashoffset;
            if (isWarning) { circleEl.classList.add('warning'); codeEl.classList.add('warning'); } 
            else { circleEl.classList.remove('warning'); codeEl.classList.remove('warning'); }
        });
    },

    startTokenLoop: function() {
        const scheduleNextUpdate = () => {
            this.updateTokens();
            const delay = 1000 - (Date.now() % 1000);
            this._updateTimer = setTimeout(scheduleNextUpdate, delay);
        };
        clearTimeout(this._updateTimer); scheduleNextUpdate();
    },

    processQRFile: function(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas"); const ctx = canvas.getContext("2d");
                const maxSize = 800; let width = img.width, height = img.height;
                if (width > maxSize || height > maxSize) { const ratio = Math.min(maxSize / width, maxSize / height); width *= ratio; height *= ratio; }
                canvas.width = width; canvas.height = height; ctx.drawImage(img, 0, 0, width, height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
                
                if (code) {
                    try {
                        const url = new URL(code.data);
                        if (url.protocol !== 'otpauth:' || url.host !== 'totp') return SystemUI.showToast(I18nManager.t('app_authenticator.qr_invalid'));
                        const secret = url.searchParams.get('secret');
                        if (!secret) return SystemUI.showToast(I18nManager.t('app_authenticator.qr_no_secret'));

                        let label = decodeURIComponent(url.pathname.replace(/^\//, ''));
                        const issuer = url.searchParams.get('issuer');
                        let finalName = issuer && !label.startsWith(issuer) ? `${issuer} (${label})` : label;
                        if (this._accounts.some(acc => acc.secret === secret.toUpperCase())) return SystemUI.showToast(I18nManager.t('app_authenticator.qr_exists'));

                        const targetCat = this._currentCat === 'ALL' ? I18nManager.t('app_authenticator.cat_default') : this._currentCat;
                        this._accounts.push({ id: 'acc_' + Date.now(), name: finalName || I18nManager.t('app_authenticator.unnamed_account'), secret: secret.toUpperCase(), category: targetCat });
                        this.triggerSave(); this.renderSidebar(); this.renderList();
                        SystemUI.showToast(I18nManager.t('app_authenticator.qr_success'));
                        this.closeAllModals();
                    } catch(err) { SystemUI.showToast(I18nManager.t('app_authenticator.qr_format_err')); }
                } else { SystemUI.showToast(I18nManager.t('app_authenticator.qr_not_found')); }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    handlePaste: function(e) {
        if (SystemCore._currentPlugin !== this) return; 
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; 
        const clipboardData = e.clipboardData || window.clipboardData;
        if (!clipboardData || !clipboardData.items) return;
        for (let i = 0; i < clipboardData.items.length; i++) {
            const item = clipboardData.items[i];
            if (item.type.indexOf("image") !== -1) {
                const imageFile = item.getAsFile();
                if (imageFile) { this.processQRFile(imageFile); e.preventDefault(); break; }
            }
        }
    },

    closeAllModals: function(e) {
        if(e && !e.target.id.includes('-modal') && !e.target.id.includes('bottom-sheet') && e.target.tagName !== 'BUTTON') return;
        // ⚡ 将 auth-secret-modal 注册到点击外部一键关闭白名单中
        ['auth-add-modal', 'auth-cat-input-modal', 'auth-bottom-sheet', 'auth-pc-dropdown', 'auth-secret-modal'].forEach(id => {
            const el = document.getElementById(id); if(el) el.style.display = 'none';
        });
        this._contextMenuData = null;
    },

    escape: function(str) { return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s]); }
};