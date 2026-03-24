/**
 * 私有安全系统核心层 (V4.6.10 纯净稳定版 - 增加彻底锁存机制及无感倒计时)
 * 包含: 32字节前置盐、纯二进制流核心、GitHub 文本装甲层、彻底的内存销毁方案
 */

const CoreUtils = {
    sha256: async function(str) { const buffer = new TextEncoder().encode(str); const hashBuffer = await crypto.subtle.digest('SHA-256', buffer); return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join(''); },
    bufToBase64: async function(buf) { return new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(new Blob([buf])); }); },
    base64ToBuf: function(base64) { const binary_string = atob(base64); const bytes = new Uint8Array(binary_string.length); for (let i = 0; i < binary_string.length; i++) bytes[i] = binary_string.charCodeAt(i); return bytes.buffer; },
    bufToHex: function(buffer) { return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join(''); },
    hexToBuf: function(hex) { if (!hex) return new Uint8Array(0).buffer; const bytes = new Uint8Array(Math.ceil(hex.length / 2)); for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16); return bytes.buffer; }
};

// ================= 核心加密引擎 =================

const CoreCrypto = (() => {
    let _aesKeyL1 = null;
    let _aesKeyL2 = null;
    let _isReady = false;
    
    const encodeText = (str) => new TextEncoder().encode(str);
    const decodeText = (buf) => new TextDecoder().decode(buf);

    return {
        initKeys: async function(pwd, baseSaltHex = null) {
            let saltUint8;
            if (!baseSaltHex) {
                saltUint8 = crypto.getRandomValues(new Uint8Array(32));
                baseSaltHex = CoreUtils.bufToHex(saltUint8);
            } else {
                saltUint8 = new Uint8Array(CoreUtils.hexToBuf(baseSaltHex));
            }

            const keyMat = await crypto.subtle.importKey("raw", encodeText(pwd), { name: "PBKDF2" }, false, ["deriveKey"]);
            const salt1 = new Uint8Array([...saltUint8, ...encodeText("_Level_1")]);
            const salt2 = new Uint8Array([...saltUint8, ...encodeText("_Level_2")]);
            
            _aesKeyL1 = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt1, iterations: 600000, hash: "SHA-256" }, keyMat, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
            _aesKeyL2 = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt2, iterations: 600000, hash: "SHA-256" }, keyMat, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
            
            _isReady = true;
            return baseSaltHex; 
        },
        
        clearKeys: function() { _aesKeyL1 = null; _aesKeyL2 = null; _isReady = false; },
        
        encrypt: async function(plainText) {
            if (!_isReady) throw new Error("Keys not initialized");
            
            const compressedBuf = pako.deflate(plainText); 
            const headerZip = encodeText("ZIP:");
            const payloadBuf = new Uint8Array(headerZip.length + compressedBuf.length);
            payloadBuf.set(headerZip);
            payloadBuf.set(compressedBuf, headerZip.length);
            
            const iv1 = crypto.getRandomValues(new Uint8Array(12));
            const cipher1 = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv1 }, _aesKeyL1, payloadBuf);
            
            const iv2 = crypto.getRandomValues(new Uint8Array(12));
            const cipher2 = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv2 }, _aesKeyL2, cipher1);
            
            const magicHeader = encodeText("SEC2");
            const finalBuffer = new Uint8Array(magicHeader.length + iv1.length + iv2.length + cipher2.byteLength);
            
            let offset = 0;
            finalBuffer.set(magicHeader, offset); offset += magicHeader.length;
            finalBuffer.set(iv1, offset); offset += iv1.length;
            finalBuffer.set(iv2, offset); offset += iv2.length;
            finalBuffer.set(new Uint8Array(cipher2), offset);
            
            return finalBuffer; 
        },
        
        decrypt: async function(encryptedUint8) {
            if (!_isReady) throw new Error("Keys not initialized");
            if (encryptedUint8.byteLength < 28) throw new Error("File too small to be SEC2");
            
            const magic = decodeText(encryptedUint8.slice(0, 4));
            if (magic !== "SEC2") throw new Error("Format Corrupted or Not SEC2 Binary");
            
            const iv1 = encryptedUint8.slice(4, 16);
            const iv2 = encryptedUint8.slice(16, 28);
            const cipherText = encryptedUint8.slice(28);
            
            try {
                const decrypted1 = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv2 }, _aesKeyL2, cipherText);
                const payloadBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv1 }, _aesKeyL1, decrypted1);
                
                const header = decodeText(new Uint8Array(payloadBuf.slice(0, 4)));
                if (header === "ZIP:") {
                    return pako.inflate(new Uint8Array(payloadBuf.slice(4)), { to: 'string' });
                } else {
                    return decodeText(payloadBuf);
                }
            } catch (e) { 
                throw new Error("DataCorruptedOrWrongPassword"); 
            }
        }
    };
})();

const CoreDB = {
    async init() { return new Promise((resolve, reject) => { const req = indexedDB.open('SysDB', 1); req.onupgradeneeded = e => e.target.result.createObjectStore('handles'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); },
    async set(k, v) { const db = await this.init(); return new Promise((resolve, reject) => { const tx = db.transaction('handles', 'readwrite'); tx.objectStore('handles').put(v, k); tx.oncomplete = resolve; tx.onerror = reject; }); },
    async get(k) { const db = await this.init(); return new Promise((resolve, reject) => { const req = db.transaction('handles', 'readonly').objectStore('handles').get(k); req.onsuccess = () => resolve(req.result); req.onerror = reject; }); }
};

// ================= 数据源抽象与统一管理引擎 =================

class BaseDataSource {
    constructor(id, type, config) {
        this.id = id; 
        this.type = type; 
        this.config = Object.assign({ delayWrite: 0, forceWrite: false }, config);
        this.shadowFileList = {}; 
        this._writeTimers = {};
        this.isOffline = false;
    }

    async readPhysicalFile(physicalPath) { throw new Error("Not implemented"); }
    async commitPhysical(pluginId, additions, deletions) { throw new Error("Not implemented"); }
    async writeRawFile(path, contentUint8) { throw new Error("Not implemented"); }

    async pullRawFilelist(pluginId) { return await this.readPhysicalFile(`${pluginId}/filelist`); }

    async initShadow(pluginId) {
        try {
            const encListUint8 = await this.pullRawFilelist(pluginId);
            if (encListUint8) { 
                if (encListUint8.byteLength < 28) throw new Error(`DataCorrupted: ${pluginId}/filelist too short (${encListUint8.byteLength} bytes)`);
                const magic = new TextDecoder().decode(encListUint8.slice(0, 4));
                if (magic !== "SEC2") {
                    throw new Error(`DataCorrupted: ${pluginId}/filelist missing SEC2 header!`);
                }
                this.shadowFileList[pluginId] = JSON.parse(await CoreCrypto.decrypt(encListUint8)); 
            } else { 
                this.shadowFileList[pluginId] = {}; 
            }
            this.isOffline = false;
        } catch(e) {
            if (e.message === 'NETWORK_OFFLINE' || e.message.startsWith('SERVER_ERROR') || e.message === 'AUTH_FAILED' || e.message.startsWith('DataCorrupted:')) {
                throw e; 
            }
            this.shadowFileList[pluginId] = {};
            this.isOffline = true;
        }
        return this.shadowFileList[pluginId];
    }

    calculateDiff(pluginId, memoryFileList, memoryState) {
        const shadowList = this.shadowFileList[pluginId] || {};
        const plan = { additions: [], deletions: [], changedFids: new Set() };
        let hasChanges = false;

        for (let fid in memoryFileList) {
            const memNode = memoryFileList[fid];
            const shadowNode = shadowList[fid];

            if (memNode.deleted > 0 && Date.now() >= memNode.deleted) continue; 

            if (memNode.deleted > 0) {
                if (shadowNode && shadowNode.deleted < 0) { 
                    if (memNode.type !== 'directory') plan.deletions.push(`${pluginId}/${fid}`); 
                    plan.changedFids.add(fid);
                    hasChanges = true; 
                }
                continue;
            }

            if (!shadowNode || shadowNode.sha256 !== memNode.sha256 || shadowNode.deleted > 0) {
                if (memNode.type !== 'directory') {
                    const content = memoryState.unsyncedBlobs[fid] !== undefined ? memoryState.unsyncedBlobs[fid] : memoryState.cache[fid];
                    if (content !== undefined) plan.additions.push({ fid, content }); 
                }
                plan.changedFids.add(fid);
                hasChanges = true;
            } 
            else if (SystemVFS._getFullSnap(shadowNode) !== SystemVFS._getFullSnap(memNode)) {
                plan.changedFids.add(fid);
                hasChanges = true; 
            }
        }

        for (let fid in shadowList) {
            if (!memoryFileList[fid] && shadowList[fid].deleted < 0) { 
                if (shadowList[fid].type !== 'directory') plan.deletions.push(`${pluginId}/${fid}`); 
                hasChanges = true; 
            }
        }
        return { ...plan, hasChanges };
    }

    async push(pluginId, memoryState) {
        const memoryList = memoryState.filelist;
        const plan = this.calculateDiff(pluginId, memoryList, memoryState);

        if (!plan.hasChanges) return false;

        const svKey = `sync_version_${this.type}`;

        const safeMemList = {};
        for(let k in memoryList) {
            if(!(memoryList[k].deleted > 0 && Date.now() >= memoryList[k].deleted)) {
                safeMemList[k] = JSON.parse(JSON.stringify(memoryList[k])); 
            }
        }

        if (this.config.forceWrite) {
            plan.changedFids.forEach(fid => {
                if (safeMemList[fid]) safeMemList[fid][svKey] = (safeMemList[fid][svKey] || 0) + 1;
            });
        }

        const additionPayloads = [];
        for (let add of plan.additions) {
            const encDataUint8 = await CoreCrypto.encrypt(add.content);
            additionPayloads.push({ path: `${pluginId}/${add.fid}`, content: encDataUint8 });
        }
        
        const encListUint8 = await CoreCrypto.encrypt(JSON.stringify(safeMemList));
        additionPayloads.push({ path: `${pluginId}/filelist`, content: encListUint8 }); 

        await this.commitPhysical(pluginId, additionPayloads, plan.deletions.map(path => ({ path })));
        
        if (this.config.forceWrite) {
            plan.changedFids.forEach(fid => {
                if (memoryList[fid] && safeMemList[fid]) memoryList[fid][svKey] = safeMemList[fid][svKey];
            });
            DataSourceManager.write(pluginId, memoryState, { force: false });
        }

        this.shadowFileList[pluginId] = JSON.parse(JSON.stringify(safeMemList));
        return true;
    }
}

class LocalDataSource extends BaseDataSource {
    async readPhysicalFile(physicalPath) {
        const parts = physicalPath.split('/'); let dir = this.config.handle;
        try {
            for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i]);
            const file = await (await dir.getFileHandle(parts[parts.length - 1])).getFile(); 
            return new Uint8Array(await file.arrayBuffer()); 
        } catch(e) { return null; }
    }
    async commitPhysical(pluginId, additions, deletions) {
        for (let add of additions) {
            const parts = add.path.split('/'); let dir = this.config.handle;
            for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i], {create: true});
            const writable = await (await dir.getFileHandle(parts[parts.length - 1], {create: true})).createWritable();
            await writable.write(add.content); await writable.close();
        }
        for (let del of deletions) {
            const parts = del.path.split('/'); let dir = this.config.handle;
            try { for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i]); await dir.removeEntry(parts[parts.length - 1]); } catch(e) {}
        }
    }
    async writeRawFile(path, contentUint8) {
        const parts = path.split('/'); let dir = this.config.handle;
        for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i], {create: true});
        const writable = await (await dir.getFileHandle(parts[parts.length - 1], {create: true})).createWritable();
        await writable.write(contentUint8); await writable.close();
    }
}

class GithubDataSource extends BaseDataSource {
    async readPhysicalFile(physicalPath) {
        let res;
        try {
            res = await fetch(`https://api.github.com/repos/${this.config.repo}/contents/${physicalPath}?_t=${Date.now()}`, { 
                headers: { 
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3.raw'
                }, 
                cache: 'no-store' 
            });
        } catch (e) { throw new Error("NETWORK_OFFLINE"); }

        if (res.status === 404) return null;
        if (res.status === 401 || res.status === 403) throw new Error("AUTH_FAILED");
        if (!res.ok) throw new Error(`SERVER_ERROR_${res.status}`);
        
        const text = await res.text();

        if (text.startsWith("SEC2:")) {
            const base64Str = text.substring(5);
            return new Uint8Array(CoreUtils.base64ToBuf(base64Str));
        } else {
            throw new Error(`DataCorrupted: ${physicalPath} GitHub data format invalid, SEC2: header not found.`);
        }
    }
    
    async commitPhysical(pluginId, additions, deletions) {
        const [owner, repo] = this.config.repo.split('/');
        
        const query = `query { repository(owner: "${owner}", name: "${repo}") { defaultBranchRef { name target { ... on Commit { oid } } } } }`;
        const qRes = await fetch('https://api.github.com/graphql', { method: 'POST', headers: { 'Authorization': `bearer ${this.config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
        const qData = await qRes.json();
        
        if (!qData.data || !qData.data.repository.defaultBranchRef) {
            throw new Error(I18nManager.t('core.gh_err_empty_repo').replace('{0}', this.config.repo));
        }

        const expectedHeadOid = qData.data.repository.defaultBranchRef.target.oid;
        const branchName = qData.data.repository.defaultBranchRef.name;
        
        const ghAdditions = await Promise.all(additions.map(async add => {
            const rawBase64 = await CoreUtils.bufToBase64(add.content);
            const fileTextContent = `SEC2:${rawBase64}`;
            return { path: add.path, contents: btoa(fileTextContent) };
        }));
        
        const mutation = `mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }`;
        const variables = { input: { branch: { repositoryNameWithOwner: this.config.repo, branchName: branchName }, message: { headline: `VFS Auto Sync: ${pluginId}` }, fileChanges: { additions: ghAdditions, deletions: deletions.map(d=>({path: d.path})) }, expectedHeadOid } };
        const mRes = await fetch('https://api.github.com/graphql', { method: 'POST', headers: { 'Authorization': `bearer ${this.config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: mutation, variables }) });
        const mData = await mRes.json();
        
        if (!mRes.ok || mData.errors) throw new Error("GitHub GraphQL Commit Failed: " + (mData.errors ? mData.errors.map(e => e.message).join('; ') : 'Unknown HTTP Error'));
    }
    
    async writeRawFile(path, contentUint8) {
        let fileSha = null;
        
        const checkRes = await fetch(`https://api.github.com/repos/${this.config.repo}/contents/${path}?_t=${Date.now()}`, { headers: { 'Authorization': `token ${this.config.token}` }, cache: 'no-store' });
        if (checkRes.ok) { fileSha = (await checkRes.json()).sha; }
        
        const rawBase64 = await CoreUtils.bufToBase64(contentUint8);
        const fileTextContent = `SEC2:${rawBase64}`;
        
        const putRes = await fetch(`https://api.github.com/repos/${this.config.repo}/contents/${path}`, {
            method: 'PUT', headers: { 'Authorization': `token ${this.config.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `System Config Update: ${path}`, content: btoa(fileTextContent), sha: fileSha })
        });
        if (!putRes.ok) throw new Error("GitHub PUT failed");
    }
}

class ApiDataSource extends BaseDataSource {
    async readPhysicalFile(physicalPath) {
        let res;
        try {
            res = await fetch(`${this.config.url}?path=${physicalPath}&_t=${Date.now()}`, { headers: { 'Authorization': `Bearer ${this.config.token || ''}` }, cache: 'no-store' });
        } catch (e) { throw new Error("NETWORK_OFFLINE"); }

        if (res.status === 404) return null;
        if (res.status === 401 || res.status === 403) throw new Error("AUTH_FAILED");
        if (!res.ok) throw new Error(`SERVER_ERROR_${res.status}`);
        
        return new Uint8Array(await res.arrayBuffer());
    }
    
    async commitPhysical(pluginId, additions, deletions) {
        for (let add of additions) {
            const b64 = await CoreUtils.bufToBase64(add.content);
            const postRes = await fetch(this.config.url, { method: 'POST', headers: { 'Authorization': `Bearer ${this.config.token || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: add.path, content: b64 }) });
            if (!postRes.ok) throw new Error("API POST failed");
        }
        for (let del of deletions) {
            await fetch(`${this.config.url}?path=${del.path}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${this.config.token || ''}` } });
        }
    }
    
    async writeRawFile(path, contentUint8) {
        const b64 = await CoreUtils.bufToBase64(contentUint8);
        const postRes = await fetch(this.config.url, { method: 'POST', headers: { 'Authorization': `Bearer ${this.config.token || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path, content: b64 }) });
        if (!postRes.ok) throw new Error("API POST failed");
    }
}

const DataSourceManager = {
    _sources: {},
    register(source) { this._sources[source.id] = source; },
    get(id) { return this._sources[id]; },
    clear() { this._sources = {}; },
    
    createSource(id, config) {
        if (config.type === 'local') return new LocalDataSource(id, 'local', config);
        if (config.type === 'github') return new GithubDataSource(id, 'github', config);
        if (config.type === 'api') return new ApiDataSource(id, 'api', config);
        throw new Error("Unknown source type");
    },
    
    async write(pluginId, memoryState, options = { force: false }) {
        for (let sid in this._sources) {
            const source = this._sources[sid];
            if (source.config.forceWrite && !options.force) continue;

            const executePush = async () => {
                try { await source.push(pluginId, memoryState); } 
                catch (e) { /* ignore push error to console in stable mode */ }
            };

            if (source.config.delayWrite > 0 && !options.force) {
                if (source._writeTimers[pluginId]) clearTimeout(source._writeTimers[pluginId]);
                source._writeTimers[pluginId] = setTimeout(executePush, source.config.delayWrite);
            } else {
                if (source._writeTimers[pluginId]) clearTimeout(source._writeTimers[pluginId]);
                await executePush();
            }
        }
    },
    
    getDirtyList(pluginId) {
        const cloudSource = Object.values(this._sources).find(s => s.config.forceWrite);
        if (!cloudSource || cloudSource.isOffline) return [];
        const state = SystemVFS._plugins[pluginId]; if (!state) return [];
        const shadowList = cloudSource.shadowFileList[pluginId] || {};
        let dirtyFiles = [];
        
        for (let fid in state.filelist) {
            const memNode = state.filelist[fid];
            if (memNode.deleted > 0 && Date.now() >= memNode.deleted) continue;
            
            const shadowNode = shadowList[fid];
            if (!shadowNode || SystemVFS._getFullSnap(shadowNode) !== SystemVFS._getFullSnap(memNode)) {
                dirtyFiles.push(fid);
            }
        }
        return dirtyFiles;
    }
};

// ================= VFS 内存引擎 (L0 纯净计算层) =================

const SystemVFS = {
    _plugins: {}, _localL1Timers: {}, 
    
    _getFullSnap(meta) {
        if (!meta) return null;
        let svs = [];
        for (let k in meta) {
            if (k.startsWith('sync_version_')) svs.push(`${k}:${meta[k]}`);
        }
        svs.sort(); 
        return `${meta.name}|${meta.parentid}|${meta.sha256}|${meta.deleted}|${svs.join(',')}`;
    },

    _initPluginState(pluginId) { if (!this._plugins[pluginId]) { this._plugins[pluginId] = { filelist: {}, unsyncedBlobs: {}, conflicts: {}, cache: {} }; } return this._plugins[pluginId]; },
    
    _triggerL1Backup(pluginId) {
        if (this._localL1Timers[pluginId]) clearTimeout(this._localL1Timers[pluginId]);
        this._localL1Timers[pluginId] = setTimeout(async () => { 
            const state = this._plugins[pluginId];
            if (state) {
                const encStateUint8 = await CoreCrypto.encrypt(JSON.stringify(state)); 
                await CoreDB.set(`vfs_state_${pluginId}`, encStateUint8);
            }
            DataSourceManager.write(pluginId, state, { force: false });
        }, 3000);
    },
    
    _isCircularMove(state, sourceId, targetParentId) {
        let curr = targetParentId;
        while (curr) { if (curr === sourceId) return true; curr = state.filelist[curr]?.parentid; }
        return false;
    },

    async mountPluginFS(pluginId) {
        const state = this._initPluginState(pluginId);
        SystemUI.showSyncOverlay(I18nManager.t('core.sync_pulling_list'));
        try {
            const encCachedBuf = await CoreDB.get(`vfs_state_${pluginId}`);
            if (encCachedBuf) {
                try {
                    const cacheState = JSON.parse(await CoreCrypto.decrypt(encCachedBuf));
                    state.filelist = cacheState.filelist || {};
                    state.unsyncedBlobs = cacheState.unsyncedBlobs || {};
                    state.cache = cacheState.cache || {};
                    state.conflicts = {};
                } catch(e) {}
            }

            let cloudList = null; let cloudSource = null;
            for (let sid in DataSourceManager._sources) {
                const src = DataSourceManager._sources[sid];
                
                if (src.config.forceWrite) {
                    let success = false;
                    while(!success) {
                        try {
                            const sourceList = await src.initShadow(pluginId);
                            if (Object.keys(sourceList).length > 0 || !src.isOffline) {
                                cloudList = sourceList; cloudSource = src;
                            }
                            success = true;
                        } catch(e) {
                            if (e.message === 'NETWORK_OFFLINE' || e.message.startsWith('SERVER_ERROR') || e.message === 'AUTH_FAILED') {
                                SystemUI.hideSyncOverlay();
                                const choice = await SystemUI.askNetworkFallback(pluginId);
                                if (choice === 'retry') {
                                    SystemUI.showSyncOverlay(I18nManager.t('core.sync_pulling_list'));
                                    continue;
                                } else if (choice === 'local') {
                                    src.isOffline = true;
                                    src.shadowFileList[pluginId] = {};
                                    success = true;
                                    SystemUI.showSyncOverlay(I18nManager.t('core.sync_pulling_list'));
                                } else {
                                    throw new Error("USER_CANCELLED");
                                }
                            } else {
                                throw e; 
                            }
                        }
                    }
                } else {
                    await src.initShadow(pluginId);
                }
            }

            if (cloudList && cloudSource) {
                const svKey = `sync_version_${cloudSource.type}`;
                for (let fid in cloudList) {
                    const cNode = cloudList[fid]; 
                    const lNode = state.filelist[fid];

                    if (!lNode) { state.filelist[fid] = cNode; continue; }

                    const isLocalChanged = this._getFullSnap(lNode) !== this._getFullSnap(cNode);
                    const isCloudAhead = (cNode[svKey] || 0) > (lNode[svKey] || 0);

                    if (isLocalChanged && isCloudAhead) {
                        if (cNode.sha256 === lNode.sha256 && cNode.name === lNode.name && cNode.parentid === lNode.parentid) {
                            state.filelist[fid][svKey] = cNode[svKey]; 
                        } else {
                            state.filelist[fid] = lNode;
                            state.conflicts[fid] = { local: lNode, cloud: cNode, source: cloudSource };
                        }
                    } else if (isCloudAhead) {
                        state.filelist[fid] = cNode;
                        delete state.cache[fid]; delete state.unsyncedBlobs[fid];
                    }
                }
            }

            if (Object.keys(state.conflicts).length > 0) {
                const fid = Object.keys(state.conflicts)[0];
                const cInfo = state.conflicts[fid];
                SystemUI.showConflictDialog(pluginId, fid, cInfo.local, cInfo.cloud, cInfo.source, async (choice) => {
                    const svKey = `sync_version_${cInfo.source.type}`;
                    if (choice === 'local') {
                        state.filelist[fid] = cInfo.local;
                        state.filelist[fid][svKey] = cInfo.cloud[svKey]; 
                        state.filelist[fid].updated_at = Date.now();
                    } else if (choice === 'cloud') {
                        state.filelist[fid] = cInfo.cloud;
                        delete state.cache[fid]; delete state.unsyncedBlobs[fid];
                    }
                    delete state.conflicts[fid];
                    DataSourceManager.write(pluginId, state, { force: false });
                    if (window.SystemCore._currentPlugin && typeof window.SystemCore._currentPlugin.renderTree === 'function') { window.SystemCore._currentPlugin.renderTree(); window.SystemCore._currentPlugin.renderTabs(); }
                });
            }
        } catch (e) {
            if (e.message === 'USER_CANCELLED') throw e;
            if (e.message.startsWith('DataCorrupted:')) {
                SystemUI.showError(`🚨 Data Corrupted 🚨\n\n${e.message}`);
                throw e; 
            }
        } finally { SystemUI.hideSyncOverlay(); }
    },

    async syncCloudAndMerge(pluginId, cloudSource) {
        const state = this._plugins[pluginId];
        if (!state) return false;

        const encList = await cloudSource.pullRawFilelist(pluginId);
        if (!encList) return 'OK'; 

        let cloudList = {};
        try { cloudList = JSON.parse(await CoreCrypto.decrypt(encList)); } catch (e) { return 'OK'; }

        let hasConflict = false; let hasCloudUpdates = false;
        const svKey = `sync_version_${cloudSource.type}`;

        for (let fid in cloudList) {
            const cNode = cloudList[fid]; 
            const lNode = state.filelist[fid];
            const shadowNode = cloudSource.shadowFileList[pluginId]?.[fid];

            if (!lNode) { state.filelist[fid] = cNode; hasCloudUpdates = true; continue; }

            const isLocalChanged = !shadowNode || this._getFullSnap(lNode) !== this._getFullSnap(shadowNode);
            const isCloudChanged = !shadowNode || this._getFullSnap(cNode) !== this._getFullSnap(shadowNode);
            
            const isCloudAhead = (cNode[svKey] || 0) > (lNode[svKey] || 0);

            if (isLocalChanged && isCloudChanged) {
                if (cNode.sha256 === lNode.sha256 && cNode.name === lNode.name && cNode.parentid === lNode.parentid) {
                    state.filelist[fid][svKey] = cNode[svKey];
                } else {
                    state.conflicts[fid] = { local: lNode, cloud: cNode, source: cloudSource }; hasConflict = true;
                }
            } else if (isCloudAhead) {
                state.filelist[fid] = cNode;
                delete state.cache[fid]; delete state.unsyncedBlobs[fid]; hasCloudUpdates = true;
            }
        }

        if (hasConflict) {
            const fid = Object.keys(state.conflicts)[0];
            const cInfo = state.conflicts[fid];
            SystemUI.showConflictDialog(pluginId, fid, cInfo.local, cInfo.cloud, cInfo.source, async (choice) => {
                if (choice === 'local') {
                    state.filelist[fid] = cInfo.local;
                    state.filelist[fid][svKey] = cInfo.cloud[svKey];
                    state.filelist[fid].updated_at = Date.now();
                } else if (choice === 'cloud') {
                    state.filelist[fid] = cInfo.cloud;
                    delete state.cache[fid]; delete state.unsyncedBlobs[fid];
                }
                delete state.conflicts[fid];
                DataSourceManager.write(pluginId, state, { force: true });
                if (window.SystemCore._currentPlugin && typeof window.SystemCore._currentPlugin.renderTree === 'function') { window.SystemCore._currentPlugin.renderTree(); window.SystemCore._currentPlugin.renderTabs(); }
            });
            return 'CONFLICT'; 
        }

        if (hasCloudUpdates) {
            if (window.SystemCore._currentPlugin && typeof window.SystemCore._currentPlugin.renderTree === 'function') { window.SystemCore._currentPlugin.renderTree(); window.SystemCore._currentPlugin.renderTabs(); }
        }
        return 'OK'; 
    },

    async createNode(pluginId, name, type = 'text', parentid = null, initialContent = "") {
        const state = this._initPluginState(pluginId); 
        const nodeId = Math.floor(1000000000 + Math.random() * 9000000000) + '_' + Date.now();
        const sha = type === 'directory' ? "" : await CoreUtils.sha256(initialContent);
        
        state.filelist[nodeId] = { 
            name, parentid, type, 
            sha256: sha, deleted: -1, 
            updated_at: Date.now()
        };
        
        if (type !== 'directory') { state.unsyncedBlobs[nodeId] = initialContent; state.cache[nodeId] = initialContent; }
        this._triggerL1Backup(pluginId); return nodeId;
    },

    async readFile(pluginId, fileId) {
        const state = this._plugins[pluginId]; if (!state || !state.filelist[fileId] || state.filelist[fileId].deleted > 0) return null;
        if (state.filelist[fileId].type === 'directory') return null;
        if (state.unsyncedBlobs[fileId] !== undefined) return state.unsyncedBlobs[fileId];
        
        if (state.cache[fileId] !== undefined) return state.cache[fileId];

        SystemUI.showSyncOverlay(I18nManager.t('core.sync_pulling_file'));
        try {
            let content = null;
            
            for (let sid in DataSourceManager._sources) {
                const src = DataSourceManager._sources[sid];
                if (!src.config.forceWrite) continue; 
                
                let success = false;
                while(!success) {
                    try {
                        const encDataUint8 = await src.readPhysicalFile(`${pluginId}/${fileId}`);
                        if (encDataUint8) { content = await CoreCrypto.decrypt(encDataUint8); }
                        success = true;
                    } catch(e) {
                        if (e.message === 'NETWORK_OFFLINE' || e.message.startsWith('SERVER_ERROR') || e.message === 'AUTH_FAILED') {
                            SystemUI.hideSyncOverlay();
                            const meta = state.filelist[fileId];
                            const fName = meta ? meta.name : fileId;
                            const choice = await SystemUI.askNetworkFallback(fName);
                            SystemUI.showSyncOverlay(I18nManager.t('core.sync_pulling_file'));
                            if (choice === 'retry') {
                                continue;
                            } else if (choice === 'local') {
                                success = true; 
                            } else {
                                throw new Error("USER_CANCELLED");
                            }
                        } else {
                            success = true;
                        }
                    }
                }
            }

            if (content === null) {
                for (let sid in DataSourceManager._sources) {
                    const src = DataSourceManager._sources[sid];
                    if (src.config.forceWrite) continue; 
                    try {
                        const encDataUint8 = await src.readPhysicalFile(`${pluginId}/${fileId}`);
                        if (encDataUint8) { content = await CoreCrypto.decrypt(encDataUint8); break; }
                    } catch(e) {}
                }
            }
            
            if (content !== null) state.cache[fileId] = content; 
            return content;
        } catch(e) {
            if(e.message === 'USER_CANCELLED') return null;
            throw e;
        } finally { SystemUI.hideSyncOverlay(); }
    },

    async writeFile(pluginId, fileId, content) {
        const state = this._plugins[pluginId]; 
        if (!state || !state.filelist[fileId] || state.filelist[fileId].deleted > 0 || state.filelist[fileId].type === 'directory') return false;
        
        const newSha = await CoreUtils.sha256(content);
        if (newSha === state.filelist[fileId].sha256) return true; 

        state.filelist[fileId].sha256 = newSha; state.filelist[fileId].updated_at = Date.now(); 
        state.unsyncedBlobs[fileId] = content; state.cache[fileId] = content; 
        this._triggerL1Backup(pluginId); return true;
    },

    renameNode(pluginId, nodeId, newName) {
        const state = this._plugins[pluginId]; if (!state || !state.filelist[nodeId] || state.filelist[nodeId].deleted > 0) return false;
        state.filelist[nodeId].name = newName; state.filelist[nodeId].updated_at = Date.now(); 
        this._triggerL1Backup(pluginId); return true;
    },

    moveNode(pluginId, nodeId, newParentId) {
        const state = this._plugins[pluginId]; if (!state || !state.filelist[nodeId] || state.filelist[nodeId].deleted > 0) return false;
        if (this._isCircularMove(state, nodeId, newParentId)) { SystemUI.showError(I18nManager.t('core.vfs_err_circular_move')); return false; }
        state.filelist[nodeId].parentid = newParentId; state.filelist[nodeId].updated_at = Date.now();
        this._triggerL1Backup(pluginId); return true;
    },

    deleteNode(pluginId, nodeId) {
        const state = this._plugins[pluginId]; if (!state || !state.filelist[nodeId]) return false;
        this._cascadeDelete(state, nodeId);
        this._triggerL1Backup(pluginId); return true;
    },
    
    _cascadeDelete(state, nodeId) {
        const meta = state.filelist[nodeId];
        if (!meta || meta.deleted > 0) return;
        
        const hasBeenSynced = Object.keys(meta).some(k => k.startsWith('sync_version_') && meta[k] > 0);
        if (!hasBeenSynced) {
            delete state.filelist[nodeId];
        } else {
            meta.deleted = Date.now() + (30 * 24 * 60 * 60 * 1000); 
            meta.updated_at = Date.now(); 
        }
        
        delete state.cache[nodeId]; delete state.unsyncedBlobs[nodeId];
        for (let childId in state.filelist) { if (state.filelist[childId].parentid === nodeId) { this._cascadeDelete(state, childId); } }
    }
};

window.SystemAPI = {
    async initPluginFS(pluginId) { return await SystemVFS.mountPluginFS(pluginId); },
    getFileList(pluginId) { return SystemVFS._plugins[pluginId]?.filelist || {}; },
    
    async createFile(pluginId, name, parentid = null, initialContent = "") { return await SystemVFS.createNode(pluginId, name, 'text', parentid, initialContent); },
    async createDirectory(pluginId, name, parentid = null) { return await SystemVFS.createNode(pluginId, name, 'directory', parentid, ""); },
    async readFile(pluginId, fileId) { return await SystemVFS.readFile(pluginId, fileId); },
    async writeFile(pluginId, fileId, content) { return await SystemVFS.writeFile(pluginId, fileId, content); },
    
    renameNode(pluginId, nodeId, newName) { return SystemVFS.renameNode(pluginId, nodeId, newName); },
    moveNode(pluginId, nodeId, newParentId) { return SystemVFS.moveNode(pluginId, nodeId, newParentId); },
    deleteNode(pluginId, nodeId) { return SystemVFS.deleteNode(pluginId, nodeId); },
    
    getCloudDirtyList(pluginId) { return DataSourceManager.getDirtyList(pluginId); },
    
    async saveLocal(pluginId) {
        const state = SystemVFS._plugins[pluginId];
        if (state) DataSourceManager.write(pluginId, state, { force: false });
    },

    async syncCloud(pluginId) {
        SystemUI.showSyncOverlay(I18nManager.t('core.sync_app_data', pluginId));
        try {
            const state = SystemVFS._plugins[pluginId];
            let hasSyncSource = false;
            
            for (let sid in DataSourceManager._sources) {
                const source = DataSourceManager._sources[sid];
                if (source.config.forceWrite) { 
                    hasSyncSource = true;
                    const status = await SystemVFS.syncCloudAndMerge(pluginId, source);
                    if (status === 'CONFLICT') return false; 
                    await source.push(pluginId, state);
                }
            }

            if (!hasSyncSource) {
                SystemUI.showToast(I18nManager.t('core.no_cloud_configured'));
                return false;
            }

            SystemUI.showToast(I18nManager.t('core.sync_success') || '云端同步成功');
            return true;
        } catch (e) {
            const msg = e.message || 'Unknown Exception';
            if (msg.includes('冲突') || msg.includes('Oid Mismatch') || msg.includes('conflict')) {
                SystemUI.showConfirm(I18nManager.t('core.gh_err_conflict') || "⚠️ 检测到物理层冲突！\n其他设备已修改云端数据。请稍后再试或拉取最新数据。", () => {});
            } else {
                if (SystemUI.showError) SystemUI.showError(`${I18nManager.t('core.sync_exception') || '同步异常'} [${pluginId}]:\n\n${msg}`);
                else SystemUI.showToast(`${I18nManager.t('core.sync_exception')}: ${msg}`);
            }
            return false;
        } finally { SystemUI.hideSyncOverlay(true); }
    }
};

const SystemUI = {
    toastTimer: null, confirmCallback: null, _syncOverlayCount: 0,
    showSyncOverlay(msg) {
        this._syncOverlayCount++; let el = document.getElementById('sys-sync-overlay');
        if (!el) {
            el = document.createElement('div'); el.id = 'sys-sync-overlay';
            el.innerHTML = `<style>#sys-sync-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 20000; display: flex; flex-direction: column; justify-content: center; align-items: center; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); transition: opacity 0.3s; } .sys-spinner { width: 50px; height: 50px; border: 4px solid rgba(255,255,255,0.1); border-top-color: var(--sys-primary); border-radius: 50%; animation: sys-spin 1s linear infinite; } @keyframes sys-spin { to { transform: rotate(360deg); } } #sys-sync-msg { margin-top: 24px; color: rgba(255, 255, 255, 0.95); font-size: 1.1rem; font-weight: 500; letter-spacing: 0.5px; text-align: center; padding: 0 24px; line-height: 1.6; box-sizing: border-box; max-width: 400px; }</style><div class="sys-spinner"></div><div id="sys-sync-msg"></div>`;
            document.body.appendChild(el);
        }
        document.getElementById('sys-sync-msg').innerText = msg; el.style.display = 'flex';
    },
    hideSyncOverlay(force = false) {
        this._syncOverlayCount = Math.max(0, this._syncOverlayCount - 1);
        if (force || this._syncOverlayCount === 0) { const el = document.getElementById('sys-sync-overlay'); if (el) el.style.display = 'none'; }
    },
    showConfirm(msg, callback) { document.getElementById('sys-confirm-msg').innerText = msg; this.confirmCallback = callback; document.getElementById('sys-confirm-modal').style.display = 'flex'; },
    closeConfirm() { document.getElementById('sys-confirm-modal').style.display = 'none'; this.confirmCallback = null; },
    
    askNetworkFallback(targetName) {
        return new Promise(resolve => {
            let el = document.getElementById('sys-network-modal');
            if (!el) {
                el = document.createElement('div');
                el.id = 'sys-network-modal';
                el.className = 'sys-modal-overlay';
                el.style.zIndex = '10006'; 
                document.body.appendChild(el);
            }
            
            const title = I18nManager.t('core.net_fallback_title') || 'Cloud Connection Failed';
            const descTpl = I18nManager.t('core.net_fallback_desc') || 'Network error occurred while fetching <b>[{0}]</b>. The cloud is your primary secure backup. Please check your connection and retry.<br><br>If offline, you may force using local cache.';
            const desc = descTpl.replace('{0}', targetName);
            
            window._sysNetCb = (choice) => {
                el.style.display = 'none';
                resolve(choice);
            };
            
            el.innerHTML = `
                <div class="sys-modal" style="max-width: 440px; padding: 30px;">
                    <h3 style="margin-bottom: 16px; font-size: 1.25rem; color: var(--sys-danger); display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-rounded">cloud_off</span>
                        <span>${title}</span>
                    </h3>
                    <div style="color: var(--sys-text); font-size: 0.95rem; line-height: 1.6; margin-bottom: 24px;">
                        ${desc}
                    </div>
                    <div class="modal-actions" style="margin-top: 0; flex-direction: column; gap: 12px;">
                        <button class="sys-btn primary" onclick="window._sysNetCb('retry')" style="width: 100%;">
                            <span class="material-symbols-rounded">refresh</span> ${I18nManager.t('core.btn_retry') || 'Retry Connection'}
                        </button>
                        <button class="sys-btn ghost" onclick="window._sysNetCb('local')" style="width: 100%; border: 1px solid var(--sys-border);">
                            <span class="material-symbols-rounded">dns</span> ${I18nManager.t('core.btn_use_local') || 'Force Local Cache'}
                        </button>
                        <button class="sys-btn ghost" onclick="window._sysNetCb('cancel')" style="width: 100%; color: var(--sys-text-muted);">
                            ${I18nManager.t('core.cancel') || 'Cancel'}
                        </button>
                    </div>
                </div>
            `;
            el.style.display = 'flex';
        });
    },

    showConflictDialog(pluginId, fileId, localMeta, cloudMeta, source, callback) {
        let el = document.getElementById('sys-conflict-modal');
        if (!el) { el = document.createElement('div'); el.id = 'sys-conflict-modal'; el.className = 'sys-modal-overlay'; el.style.zIndex = '10005'; document.body.appendChild(el); }
        window._sysConflictCb = (choice) => { el.style.display = 'none'; if (callback) callback(choice); };
        
        const svKey = `sync_version_${source.type}`;
        const formatTime = (ts) => ts ? new Date(ts).toLocaleString() : 'Unknown Time';

        let descHtml = (I18nManager.t('core.conflict_desc') || `File <b>{0}</b> has conflicts. Please choose:`).replace('{0}', localMeta.name);
        let locVerText = (I18nManager.t('core.conflict_local_ver') || `Local ver: {0}`).replace('{0}', localMeta[svKey] || 0);
        let cldVerText = (I18nManager.t('core.conflict_cloud_ver') || `Cloud ver: {0}`).replace('{0}', cloudMeta[svKey] || 0);
        let locModText = (I18nManager.t('core.conflict_last_mod') || `Modified: {0}`).replace('{0}', formatTime(localMeta.updated_at));
        let cldModText = (I18nManager.t('core.conflict_last_sync') || `Synced: {0}`).replace('{0}', formatTime(cloudMeta.updated_at));

        el.innerHTML = `
            <div class="sys-modal" style="max-width: 500px; padding: 30px;">
                <h3 style="margin-bottom: 16px; font-size: 1.25rem; color: var(--sys-danger); display: flex; align-items: center; gap: 8px;">
                    <span class="material-symbols-rounded">rule_folder</span>
                    <span>${I18nManager.t('core.conflict_title') || 'Conflict Detected'}</span>
                </h3>
                <div style="color: var(--sys-text); font-size: 0.95rem; line-height: 1.6; margin-bottom: 24px;">
                    ${descHtml}<br><br>
                    <div style="background: var(--sys-surface-hover); padding: 16px; border-radius: 12px; margin-bottom: 12px; cursor: pointer; border: 2px solid transparent; transition: border 0.2s;" onmouseover="this.style.borderColor='var(--sys-primary)'" onmouseout="this.style.borderColor='transparent'" onclick="window._sysConflictCb('local')">
                        <div style="font-weight: 600; font-size: 1.05rem; color: var(--sys-primary); margin-bottom: 4px;">${I18nManager.t('core.conflict_local_title') || '💻 Keep Local'}</div>
                        <div style="font-size: 0.85rem; color: var(--sys-text-muted);">
                            ${I18nManager.t('core.conflict_local_desc') || 'Keep local modifications and overwrite cloud.'}<br>
                            (${locVerText})<br>
                            <span style="opacity: 0.8;">${locModText}</span>
                        </div>
                    </div>
                    <div style="background: var(--sys-surface-hover); padding: 16px; border-radius: 12px; cursor: pointer; border: 2px solid transparent; transition: border 0.2s;" onmouseover="this.style.borderColor='var(--sys-primary)'" onmouseout="this.style.borderColor='transparent'" onclick="window._sysConflictCb('cloud')">
                        <div style="font-weight: 600; font-size: 1.05rem; color: var(--sys-primary); margin-bottom: 4px;">${I18nManager.t('core.conflict_cloud_title') || '☁️ Keep Cloud'}</div>
                        <div style="font-size: 0.85rem; color: var(--sys-text-muted);">
                            ${I18nManager.t('core.conflict_cloud_desc') || 'Discard local changes and pull from cloud.'}<br>
                            (${cldVerText})<br>
                            <span style="opacity: 0.8;">${cldModText}</span>
                        </div>
                    </div>
                </div>
                <div class="modal-actions" style="margin-top: 0; justify-content: flex-end;">
                    <button class="sys-btn ghost" onclick="document.getElementById('sys-conflict-modal').style.display='none';" style="width: auto; padding: 10px 20px;">${I18nManager.t('core.btn_later') || 'Later'}</button>
                </div>
            </div>
        `;
        el.style.display = 'flex';
    },

    showError(msg) {
        let el = document.getElementById('sys-error-modal');
        if (!el) {
            el = document.createElement('div');
            el.id = 'sys-error-modal';
            el.className = 'sys-modal-overlay';
            el.style.zIndex = '10005'; 
            el.innerHTML = `
                <div class="sys-modal" style="max-width: 680px; padding: 30px;">
                    <h3 style="margin-bottom: 16px; font-size: 1.25rem; color: var(--sys-danger); display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-rounded">error</span>
                        <span id="sys-err-title">${I18nManager.t('core.error_title') || 'Error'}</span>
                    </h3>
                    <div id="sys-error-msg" style="color: #d4d4d4; font-family: Consolas, monospace; font-size: 0.9rem; line-height: 1.5; margin-bottom: 24px; word-break: break-all; white-space: pre-wrap; max-height: 50vh; overflow-y: auto; background: #1e1e1e; padding: 16px; border-radius: 8px; border: 1px solid #333; user-select: text;"></div>
                    <div class="modal-actions" style="margin-top: 0; display: flex; align-items: center; width: 100%;">
                        <button class="sys-btn ghost" onclick="navigator.clipboard.writeText(document.getElementById('sys-error-msg').innerText).then(() => SystemUI.showToast(I18nManager.t('core.msg_copied') || 'Copied'))" style="width: auto; padding: 10px 16px; margin-right: auto; color: var(--sys-text-muted);">
                            <span class="material-symbols-rounded" style="font-size: 1.1rem; margin-right: 4px;">content_copy</span>
                            <span id="sys-err-btn-copy">${I18nManager.t('core.btn_copy_err') || 'Copy'}</span>
                        </button>
                        <button class="sys-btn primary" onclick="document.getElementById('sys-error-modal').style.display='none'" style="width: auto; padding: 10px 24px; background: var(--sys-danger); color: var(--sys-on-danger);" id="sys-err-btn-ok">${I18nManager.t('core.btn_i_know') || 'OK'}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(el);
        } else {
            document.getElementById('sys-err-title').innerText = I18nManager.t('core.error_title') || 'Error';
            document.getElementById('sys-err-btn-copy').innerText = I18nManager.t('core.btn_copy_err') || 'Copy';
            document.getElementById('sys-err-btn-ok').innerText = I18nManager.t('core.btn_i_know') || 'OK';
        }
        document.getElementById('sys-error-msg').innerText = msg;
        el.style.display = 'flex';
    },
    initTheme() {
        const savedTheme = localStorage.getItem('sys_theme'); const isDark = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
        const iconEl = document.getElementById('icon-theme-toggle');
        if (isDark) { document.documentElement.setAttribute('data-theme', 'dark'); if(iconEl) iconEl.innerText = 'light_mode'; } 
        else { document.documentElement.setAttribute('data-theme', 'light'); if(iconEl) iconEl.innerText = 'dark_mode'; }
    },
    toggleTheme() {
        const html = document.documentElement; const newTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; const iconEl = document.getElementById('icon-theme-toggle');
        html.setAttribute('data-theme', newTheme); localStorage.setItem('sys_theme', newTheme);
        if(iconEl) iconEl.innerText = newTheme === 'dark' ? 'light_mode' : 'dark_mode';
    },
    showToast(msg) {
        const el = document.getElementById('sys-toast'); el.innerText = msg; el.classList.add('show');
        clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
    },
    switchScreen(id) { document.querySelectorAll('.sys-screen').forEach(el => el.style.display = 'none'); document.getElementById(id).style.display = 'flex'; },
    toggleSidebar(forceClose = false) { 
        const dock = document.getElementById('sys-dock'); const overlay = document.getElementById('sys-sidebar-overlay'); const isOpen = dock.classList.contains('open');
        if (forceClose || isOpen) { dock.classList.remove('open'); if (overlay) { overlay.classList.remove('show'); setTimeout(() => { overlay.style.display = 'none'; }, 300); } } 
        else { dock.classList.add('open'); if (overlay) { overlay.style.display = 'block'; overlay.offsetHeight; overlay.classList.add('show'); } }
    },
    toggleDesktopDock() { document.getElementById('sys-dock').classList.toggle('expanded'); },
    toggleSetupFields() {
        const type = document.getElementById('setup-storage-type').value;
        document.getElementById('setup-github-fields').style.display = type === 'github' ? 'block' : 'none';
        document.getElementById('setup-api-fields').style.display = type === 'api' ? 'block' : 'none';
        const bindBtn = document.getElementById('sys-btn-bind'); bindBtn.setAttribute('data-i18n', type === 'local' ? 'core.btn_mount_local' : 'core.btn_mount'); I18nManager.translateDOM(bindBtn.parentElement);
    },
    toggleSettingsFields() {
        document.getElementById('set-local-fields').style.display = document.getElementById('set-chk-local').checked ? 'block' : 'none';
        document.getElementById('set-github-fields').style.display = document.getElementById('set-chk-github').checked ? 'block' : 'none';
        document.getElementById('set-api-fields').style.display = document.getElementById('set-chk-api').checked ? 'block' : 'none';
    },
    
    // ⚡ 修改：控制密码二次输入与规范提示的显示逻辑
    setMode(mode) {
        ['lock-setup-area', 'lock-input-area'].forEach(id => document.getElementById(id).style.display = 'none');
        const titleEl = document.getElementById('lock-title'); const descEl = document.getElementById('lock-desc'); const unlockBtn = document.getElementById('sys-btn-unlock');
        if (mode === 'BIND_NEW') { titleEl.setAttribute('data-i18n', 'core.sys_init'); descEl.setAttribute('data-i18n', 'core.sys_uninitialized'); document.getElementById('lock-setup-area').style.display = 'block'; this.toggleSetupFields(); } 
        else if (mode === 'CREATE_PWD' || mode === 'UNLOCK') { 
            titleEl.setAttribute('data-i18n', mode === 'CREATE_PWD' ? 'core.sys_create_pwd' : 'core.sys_locked'); 
            descEl.setAttribute('data-i18n', mode === 'CREATE_PWD' ? 'core.sys_create_pwd_desc' : 'core.sys_locked_desc'); 
            unlockBtn.setAttribute('data-i18n', mode === 'CREATE_PWD' ? 'core.btn_create' : 'core.btn_unlock'); 
            document.getElementById('lock-input-area').style.display = 'block'; 
            
            // 全新系统时显示密码确认与提示
            if (mode === 'CREATE_PWD') {
                document.getElementById('sys-pwd2').style.display = 'block';
                document.getElementById('sys-pwd-tip').style.display = 'block';
            } else {
                document.getElementById('sys-pwd2').style.display = 'none';
                document.getElementById('sys-pwd-tip').style.display = 'none';
            }
        }
        I18nManager.translateDOM(); 
    },
    async openSettings() {
        document.getElementById('sys-lang-select').value = I18nManager.currentLang;
        const st = SystemCore.config.storage || {}; const bType = this.bootConfig?.type;
        const chkLocal = document.getElementById('set-chk-local'); const chkGh = document.getElementById('set-chk-github'); const chkApi = document.getElementById('set-chk-api');
        
        // ⚡ 新增读取自动锁定时间
        document.getElementById('sys-auto-lock-select').value = SystemCore.config.auto_lock || 0;
        
        chkLocal.checked = !!st.local || bType === 'local'; chkLocal.disabled = (bType === 'local');
        const dirNameEl = document.getElementById('set-local-dir-name'); dirNameEl.innerText = "...";
        try {
            let handleName = ''; if (bType === 'local' && this.bootConfig.handle) handleName = this.bootConfig.handle.name; else if (chkLocal.checked) { const handle = await CoreDB.get('sys_dir_handle'); if (handle) handleName = handle.name; }
            dirNameEl.innerText = handleName ? `${I18nManager.t('core.current_dir')}: ${handleName}` : I18nManager.t('core.no_dir_bound');
        } catch(e) { dirNameEl.innerText = I18nManager.t('core.no_dir_bound'); }
        chkGh.checked = !!st.github || bType === 'github'; chkGh.disabled = (bType === 'github'); document.getElementById('set-gh-token').value = st.github?.token || (bType === 'github' ? this.bootConfig.token : ''); document.getElementById('set-gh-repo').value = st.github?.repo || (bType === 'github' ? this.bootConfig.repo : '');
        chkApi.checked = !!st.api || bType === 'api'; document.getElementById('set-api-url').value = st.api?.url || (bType === 'api' ? this.bootConfig.url : ''); document.getElementById('set-api-token').value = st.api?.token || (bType === 'api' ? this.bootConfig.token : '');
        this.toggleSettingsFields(); document.getElementById('sys-settings-modal').style.display = 'flex';
    }
};

const SystemCore = {
    config: {}, _sysState: 'UNKNOWN', _currentPlugin: null, _loadedPlugins: {}, bootConfig: null,
    
    // ⚡ 新增：自动锁定的内置状态
    _autoLockTimer: null,
    _lastActivity: Date.now(),
    _autoLockListeners: null,
    
    _createSource(id, config) {
        if (config.type === 'local') return new LocalDataSource(id, 'local', config);
        if (config.type === 'github') return new GithubDataSource(id, 'github', config);
        if (config.type === 'api') return new ApiDataSource(id, 'api', config);
        throw new Error("Unknown source type");
    },

    _setupDataSources() {
        DataSourceManager.clear();
        const st = this.config.storage || {};
        const boot = this.bootConfig || {};
        
        if (st.local || boot.type === 'local') {
            let handle = boot.type === 'local' ? boot.handle : null;
            if(!handle && st.local) {
                CoreDB.get('sys_dir_handle').then(h => {
                    if(h) DataSourceManager.register(new LocalDataSource('local_main', 'local', { handle: h, delayWrite: 10000 }));
                });
            } else if(handle) {
                DataSourceManager.register(new LocalDataSource('local_main', 'local', { handle, delayWrite: 10000 }));
            }
        }
        if (st.github || boot.type === 'github') {
            const token = st.github?.token || boot.token; const repo = st.github?.repo || boot.repo;
            DataSourceManager.register(new GithubDataSource('github_main', 'github', { token, repo, forceWrite: true }));
        }
        if (st.api || boot.type === 'api') {
            const url = st.api?.url || boot.url; const token = st.api?.token || boot.token;
            DataSourceManager.register(new ApiDataSource('api_main', 'api', { url, token, forceWrite: true }));
        }
    },

    async boot() {
        SystemUI.initTheme();
        try { 
            const savedEncConfig = localStorage.getItem('sys_boot_config_enc'); 
            if (!savedEncConfig) return SystemUI.setMode('BIND_NEW'); 
            this._sysState = 'UNLOCK_LOCAL'; SystemUI.setMode('UNLOCK'); 
        } 
        catch (e) { SystemUI.setMode('BIND_NEW'); }
    },
    
    async handleBindStorage() {
        const type = document.getElementById('setup-storage-type').value; let config = { type };
        try {
            if (type === 'local') { if (!window.showDirectoryPicker) return SystemUI.showToast(I18nManager.t('core.err_no_fs_api')); const handle = await window.showDirectoryPicker({mode: 'readwrite'}); await CoreDB.set('sys_dir_handle', handle); config.handle = handle; } 
            else if (type === 'github') { config.token = document.getElementById('setup-gh-token').value.trim(); config.repo = document.getElementById('setup-gh-repo').value.trim(); if (!config.token || !config.repo) return SystemUI.showToast(I18nManager.t('core.err_gh_incomplete')); } 
            else if (type === 'api') { config.url = document.getElementById('setup-api-url').value.trim(); config.token = document.getElementById('setup-api-token').value.trim(); if (!config.url) return SystemUI.showToast(I18nManager.t('core.err_api_incomplete')); }
            
            this.bootConfig = config; 
            await this.checkSystemFiles();
        } catch (e) { if (e.name !== 'AbortError') SystemUI.showToast(I18nManager.t('core.mount_failed', e.message || e.name)); }
    },
    
    async checkSystemFiles() {
        SystemUI.showSyncOverlay(I18nManager.t('core.detecting_storage'));
        try { 
            const bootSource = this._createSource('boot', this.bootConfig);
            const content = await bootSource.readPhysicalFile('boot_config');
            const configExists = content !== null;
            
            if (configExists && content.byteLength < 32) {
                throw new Error(I18nManager.t('core.err_legacy_repo') || "Legacy or corrupted repository detected. Please clear remote data and try again.");
            }
            
            this._sysState = configExists ? 'UNLOCK_REMOTE_FIRST_TIME' : 'CREATE'; 
            SystemUI.setMode(configExists ? 'UNLOCK' : 'CREATE_PWD'); 
            
            SystemUI.hideSyncOverlay(true); 
        } 
        catch(e) { 
            SystemUI.hideSyncOverlay(true);
            
            if (e.message === 'NETWORK_OFFLINE' || e.message.startsWith('SERVER_ERROR')) {
                SystemUI.showError(I18nManager.t('core.connect_failed_detail', 'Network Offline') || "网络连接失败，无法探测存储池，请检查网络。");
            } else if (e.message === 'AUTH_FAILED') {
                SystemUI.showError(I18nManager.t('core.auth_failed') || "云端身份验证被拒绝，请检查 Token 权限和仓库名。");
            } else {
                SystemUI.showToast(I18nManager.t('core.connect_failed_detail', e.message || e.name));
            }
            SystemUI.setMode('BIND_NEW'); 
        }
    },

    async saveEncryptedBootConfig() { 
        const configToSave = { ...this.bootConfig }; 
        delete configToSave.handle; 
        const encBootUint8 = await CoreCrypto.encrypt(JSON.stringify(configToSave)); 
        
        const saltBuf = new Uint8Array(CoreUtils.hexToBuf(this.bootConfig.salt));
        const finalBuf = new Uint8Array(saltBuf.byteLength + encBootUint8.byteLength);
        finalBuf.set(saltBuf, 0);
        finalBuf.set(encBootUint8, saltBuf.byteLength);
        
        const encBootB64 = await CoreUtils.bufToBase64(finalBuf);
        localStorage.setItem('sys_boot_config_enc', encBootB64); 
    },

    async saveSysConfig() {
        SystemUI.showSyncOverlay(I18nManager.t('core.sync_saving_core'));
        try {
            const encryptedUint8 = await CoreCrypto.encrypt(JSON.stringify(this.config));
            
            const saltBuf = new Uint8Array(CoreUtils.hexToBuf(this.bootConfig.salt));
            const finalBuf = new Uint8Array(saltBuf.byteLength + encryptedUint8.byteLength);
            finalBuf.set(saltBuf, 0);
            finalBuf.set(encryptedUint8, saltBuf.byteLength);

            const bootSource = this._createSource('boot', this.bootConfig);
            const syncTasks = [bootSource.writeRawFile('boot_config', finalBuf)];
            
            const st = this.config.storage || {};
            if (st.github && this.bootConfig.type !== 'github') {
                syncTasks.push(this._createSource('gh_sys', {type: 'github', ...st.github}).writeRawFile('boot_config', finalBuf));
            }
            if (st.api && this.bootConfig.type !== 'api') {
                syncTasks.push(this._createSource('api_sys', {type: 'api', ...st.api}).writeRawFile('boot_config', finalBuf));
            }
            
            await Promise.all(syncTasks);
        } finally { SystemUI.hideSyncOverlay(); }
    },

    // ⚡ 启动自动锁定定时器
    startAutoLock() {
        this.stopAutoLock();
        const timeoutMinutes = this.config?.auto_lock || 0;
        if (timeoutMinutes <= 0) return;
        
        const ms = timeoutMinutes * 60 * 1000;
        this._lastActivity = Date.now();
        this._autoLockTimer = setInterval(() => {
            if (Date.now() - this._lastActivity >= ms) {
                // 确保此时是在桌面上而不是已经锁定
                if(this._sysState !== 'UNKNOWN' && document.getElementById('sys-desktop').style.display === 'flex') {
                    this.lock();
                }
            }
        }, 10000); // 每 10 秒侦测一次
        
        const resetFn = () => { this._lastActivity = Date.now(); };
        window.addEventListener('mousemove', resetFn);
        window.addEventListener('keydown', resetFn);
        window.addEventListener('touchstart', resetFn);
        window.addEventListener('click', resetFn);
        this._autoLockListeners = resetFn;
    },
    
    // ⚡ 停止自动锁定探测
    stopAutoLock() {
        if (this._autoLockTimer) clearInterval(this._autoLockTimer);
        if (this._autoLockListeners) {
            window.removeEventListener('mousemove', this._autoLockListeners);
            window.removeEventListener('keydown', this._autoLockListeners);
            window.removeEventListener('touchstart', this._autoLockListeners);
            window.removeEventListener('click', this._autoLockListeners);
            this._autoLockListeners = null;
        }
    },

    _finishLogin() { 
        this._setupDataSources();
        document.getElementById('sys-pwd').value = ""; 
        document.getElementById('sys-pwd2').value = ""; 
        SystemUI.showToast(I18nManager.t('core.auth_success')); 
        SystemUI.switchScreen('sys-desktop'); 
        this.loadPlugins(); 
        
        // ⚡ 登录成功后启动侦测
        this.startAutoLock();
    },

    async handleAuth() {
        const pwd = document.getElementById('sys-pwd').value; if (!pwd) return SystemUI.showToast(I18nManager.t('core.pwd_empty')); SystemUI.showToast(I18nManager.t('core.processing_key'));
        try {
            if (this._sysState === 'UNLOCK_LOCAL') {
                const encConfigB64 = localStorage.getItem('sys_boot_config_enc'); 
                if (!encConfigB64) throw new Error("Local config missing");
                
                const fullBuf = new Uint8Array(CoreUtils.base64ToBuf(encConfigB64));
                if (fullBuf.byteLength < 32) throw new Error("Corrupted local config: Too short for Salt");

                const saltBuf = fullBuf.slice(0, 32);
                const encConfigUint8 = fullBuf.slice(32);
                const savedSaltHex = CoreUtils.bufToHex(saltBuf);
                
                await CoreCrypto.initKeys(pwd, savedSaltHex);
                
                let decConfigStr;
                try { decConfigStr = await CoreCrypto.decrypt(encConfigUint8); } catch(e) { throw new Error("LocalDecryptFailed"); }
                
                this.bootConfig = JSON.parse(decConfigStr);
                this.bootConfig.salt = savedSaltHex; 
                
                if (this.bootConfig.type === 'local') { const handle = await CoreDB.get('sys_dir_handle'); if (!handle || await handle.queryPermission({mode: 'readwrite'}) !== 'granted') throw new Error("LocalHandleLost"); this.bootConfig.handle = handle; }
                
                SystemUI.showSyncOverlay(I18nManager.t('core.verifying_remote'));
                try { 
                    const bootSource = this._createSource('boot', this.bootConfig);
                    const remoteFullBuf = await bootSource.readPhysicalFile('boot_config'); 
                    if (!remoteFullBuf) throw new Error("RemoteFileNotFound"); 
                    if (remoteFullBuf.byteLength < 32) throw new Error(`DataCorrupted: boot_config too short (${remoteFullBuf.byteLength} bytes)`);
                    
                    const remoteSaltBuf = remoteFullBuf.slice(0, 32);
                    const remoteEncSysUint8 = remoteFullBuf.slice(32);
                    
                    const magic = new TextDecoder().decode(remoteEncSysUint8.slice(0, 4));
                    if (magic !== "SEC2") {
                        throw new Error(`DataCorrupted: boot_config missing SEC2 header!`);
                    }

                    this.config = JSON.parse(await CoreCrypto.decrypt(remoteEncSysUint8)); 
                } catch(e) { 
                    if (e.message === 'NETWORK_OFFLINE' || e.message.startsWith('SERVER_ERROR')) throw new Error("RemoteNetworkError");
                    if (e.message === 'AUTH_FAILED') throw new Error("RemoteAuthError");
                    if (e.message === 'RemoteFileNotFound') throw e;
                    if (e.message.startsWith('DataCorrupted:')) throw e;
                    throw new Error("RemoteVerifyFailed"); 
                } finally { SystemUI.hideSyncOverlay(); }
                
                this._finishLogin();
            } 
            else if (this._sysState === 'CREATE') {
                if (pwd.length < 4) throw new Error(I18nManager.t('core.pwd_short'));
                
                // ⚡ 新增密码二次比对校验
                const pwd2 = document.getElementById('sys-pwd2').value;
                if (pwd !== pwd2) {
                    SystemUI.hideSyncOverlay(true);
                    return SystemUI.showToast(I18nManager.t('core.pwd_mismatch') || '两次密码输入不一致！');
                }
                
                const generatedSalt = await CoreCrypto.initKeys(pwd, null);
                this.bootConfig.salt = generatedSalt;

                let initStorage = {}; const bConf = this.bootConfig;
                if (bConf.type === 'local') initStorage.local = true; if (bConf.type === 'github') initStorage.github = { token: bConf.token, repo: bConf.repo }; if (bConf.type === 'api') initStorage.api = { url: bConf.url, token: bConf.token };
                
                // ⚡ 默认携带 auto_lock = 0
                this.config = { os_version: '4.6.10', created_at: Date.now(), storage: initStorage, file_meta: {}, auto_lock: 0 }; 
                await this.saveSysConfig(); 
                await this.saveEncryptedBootConfig(); 
                this._finishLogin();
            } 
            else if (this._sysState === 'UNLOCK_REMOTE_FIRST_TIME') {
                SystemUI.showSyncOverlay(I18nManager.t('core.verifying_remote'));
                try {
                    const bootSource = this._createSource('boot', this.bootConfig);
                    const remoteFullBuf = await bootSource.readPhysicalFile('boot_config');
                    if (!remoteFullBuf) throw new Error("RemoteFileNotFound");
                    if (remoteFullBuf.byteLength < 32) throw new Error(`DataCorrupted: boot_config too short (${remoteFullBuf.byteLength} bytes)`);
                    
                    const saltBuf = remoteFullBuf.slice(0, 32);
                    const encSysUint8 = remoteFullBuf.slice(32);
                    
                    const magic = new TextDecoder().decode(encSysUint8.slice(0, 4));
                    if (magic !== "SEC2") {
                        throw new Error(`DataCorrupted: boot_config missing SEC2 header!`);
                    }

                    const remoteSaltHex = CoreUtils.bufToHex(saltBuf);
                    this.bootConfig.salt = remoteSaltHex;
                    await CoreCrypto.initKeys(pwd, remoteSaltHex);

                    this.config = JSON.parse(await CoreCrypto.decrypt(encSysUint8));
                    
                    if(!this.config.storage) this.config.storage = {}; if(!this.config.file_meta) this.config.file_meta = {};
                    if (Object.keys(this.config.storage).length === 0) {
                        const bConf = this.bootConfig;
                        if (bConf.type === 'local') this.config.storage.local = true; if (bConf.type === 'github') this.config.storage.github = { token: bConf.token, repo: bConf.repo }; if (bConf.type === 'api') this.config.storage.api = { url: bConf.url, token: bConf.token };
                        await this.saveSysConfig();
                    }
                } catch(e) { 
                    if (e.message === 'NETWORK_OFFLINE' || e.message.startsWith('SERVER_ERROR')) throw new Error("RemoteNetworkError");
                    if (e.message === 'AUTH_FAILED') throw new Error("RemoteAuthError");
                    if (e.message.startsWith('DataCorrupted:')) throw e;
                    throw e; 
                } finally { SystemUI.hideSyncOverlay(); }
                await this.saveEncryptedBootConfig(); this._finishLogin();
            }
        } catch (e) {
            SystemUI.hideSyncOverlay(true); CoreCrypto.clearKeys();
            if (e.message === 'LocalDecryptFailed' || e.message === 'DataCorruptedOrWrongPassword') { 
                SystemUI.showToast(I18nManager.t('core.data_corrupted')); 
            } 
            else if (e.message.startsWith('DataCorrupted:')) {
                SystemUI.showError(I18nManager.t('core.sys_exception', e.message) + "\n\n" + (I18nManager.t('core.data_corrupted') || "底层数据拉取异常，这极有可能是 GitHub API / CDN 缓存污染或人为篡改导致的。"));
            }
            else if (e.message === 'LocalHandleLost') { SystemUI.showToast(I18nManager.t('core.err_no_fs_api')); this.switchDataSource(false); } 
            else if (e.message === 'RemoteNetworkError') { SystemUI.showError(I18nManager.t('core.net_fallback_title') || "无法连接到远端服务器，请检查网络连接或代理设置。"); }
            else if (e.message === 'RemoteAuthError') { SystemUI.showError(I18nManager.t('core.auth_failed') || "云端身份验证被拒绝 (Token可能已失效或无权限)。"); this.switchDataSource(false); }
            else if (e.message === 'RemoteVerifyFailed' || e.message === 'RemoteFileNotFound') { 
                SystemUI.showToast(I18nManager.t('core.remote_verify_failed')); 
                this.switchDataSource(false); 
            } 
            else { SystemUI.showToast(I18nManager.t('core.sys_exception', e.message || e.name)); }
        }
    },
    
    // ⚡ 核心增强：彻查与深度清理全局内存变量，保证极高安全性
    async lock() {
        SystemUI.showSyncOverlay(I18nManager.t('core.sync_locking'));
        try {
            for (let pluginId in SystemVFS._plugins) {
                await DataSourceManager.write(pluginId, SystemVFS._plugins[pluginId], { force: true });
            }
        } finally {
        
            SystemUI.hideSyncOverlay(true);
            SystemVFS._plugins = {}; for (let tid in SystemVFS._localL1Timers) { clearTimeout(SystemVFS._localL1Timers[tid]); } SystemVFS._localL1Timers = {}; DataSourceManager.clear();
            for (let pid in this._loadedPlugins) { const pluginDef = window.SystemPlugins.find(p => p.id === pid); if (pluginDef && window[pluginDef.globalName] && typeof window[pluginDef.globalName].unmount === 'function') { window[pluginDef.globalName].unmount(this._loadedPlugins[pid]); } this._loadedPlugins[pid].remove(); }
            this._loadedPlugins = {}; this._currentPlugin = null;
            document.getElementById('sys-plugin-wrapper').innerHTML = ''; document.getElementById('sys-empty-state').style.display = 'flex'; 
            document.getElementById('sys-app-actions').innerHTML = '';
            const appTitle = document.getElementById('sys-app-title'); appTitle.setAttribute('data-i18n', 'core.dock_header'); appTitle.innerText = I18nManager.t('core.dock_header');
            document.querySelectorAll('.dock-item').forEach(el => el.classList.remove('active'));
        
            // ⚡ 深度内存销毁区 (Deep Memory Wipe)
            CoreCrypto.clearKeys(); 
            this.config = {}; // 清空解密后的全盘配置文件
            this.bootConfig = null; // 清空启动源信息
            this.stopAutoLock(); // 解除所有的探测侦听器
        
            document.getElementById('sys-pwd').value = ""; 
            document.getElementById('sys-pwd2').value = ""; // 同时清空确认密码框
        
            SystemUI.switchScreen('sys-lock-screen'); SystemUI.showToast(I18nManager.t('core.locked_safe')); SystemUI.toggleSidebar(true); document.getElementById('sys-dock').classList.remove('expanded'); 
            this.boot();
        }
    },
    
    async activatePlugin(plugin, clickedElement) {
        if (this._currentPlugin && window[plugin.globalName] && this._currentPlugin === window[plugin.globalName]) { if (window.innerWidth <= 768) { SystemUI.toggleSidebar(true); } return; }
        document.querySelectorAll('.dock-item').forEach(el => el.classList.remove('active')); if (clickedElement) clickedElement.classList.add('active'); document.getElementById('sys-empty-state').style.display = 'none';
        
        const appTitle = document.getElementById('sys-app-title'); const appActions = document.getElementById('sys-app-actions');
        let pName = I18nManager.t(plugin.nameI18nKey) || plugin.id; 
        if(plugin.nameI18nKey) appTitle.setAttribute('data-i18n', plugin.nameI18nKey); else appTitle.removeAttribute('data-i18n');
        appTitle.innerText = pName; appActions.innerHTML = ''; 
        
        if (this._currentPlugin && typeof this._currentPlugin.onDeactivate === 'function') { this._currentPlugin.onDeactivate(); }
        Object.values(this._loadedPlugins).forEach(container => { container.style.display = 'none'; container.classList.remove('active'); });

        if (!this._loadedPlugins[plugin.id]) {
            SystemUI.showToast(I18nManager.t('core.starting', pName));
            const wrapper = document.getElementById('sys-plugin-wrapper'); const pContainer = document.createElement('div'); pContainer.className = 'plugin-container active'; pContainer.id = 'plugin-' + plugin.id;
            pContainer.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--sys-text-muted); width: 100%;">${I18nManager.t('core.loading_plugin', pName)}</div>`; wrapper.appendChild(pContainer);
            try {
                if (plugin.style) this._loadStyle(plugin.style); if (plugin.script) await this._loadScript(plugin.script);
                const pluginObj = window[plugin.globalName]; if (!pluginObj) throw new Error("Plugin object not found");
                this._currentPlugin = pluginObj; this._loadedPlugins[plugin.id] = pContainer; pContainer.innerHTML = ''; 
                await this._currentPlugin.mount(pContainer);
                if (typeof this._currentPlugin.onActivate === 'function') { this._currentPlugin.onActivate(); }
            } catch (e) {
                if (e.message !== 'USER_CANCELLED') {
                    pContainer.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--sys-danger); width: 100%;">${I18nManager.t('core.load_failed')}: ${e.message}</div>`; 
                } else {
                    document.getElementById('sys-empty-state').style.display = 'flex';
                }
            }
        } else {
            this._currentPlugin = window[plugin.globalName]; const pContainer = this._loadedPlugins[plugin.id]; pContainer.style.display = 'flex'; pContainer.classList.add('active');
            if (typeof this._currentPlugin.onActivate === 'function') { this._currentPlugin.onActivate(); }
        }
        if (window.innerWidth <= 768) { SystemUI.toggleSidebar(true); }
    },
    switchDataSource(silent = false) {
        const doSwitch = () => { localStorage.removeItem('sys_boot_config_enc'); localStorage.removeItem('sys_boot_config'); this.bootConfig = null; CoreCrypto.clearKeys(); CoreDB.set('sys_dir_handle', null).then(() => { location.reload(); }); };
        if (silent === true) { doSwitch(); } else { SystemUI.showConfirm(I18nManager.t('core.confirm_switch'), doSwitch); }
    },
    async bindLocalInSettings() { try { const handle = await window.showDirectoryPicker({mode: 'readwrite'}); await CoreDB.set('sys_dir_handle', handle); document.getElementById('set-local-dir-name').innerText = `${I18nManager.t('core.current_dir')}: ${handle.name}`; SystemUI.showToast(I18nManager.t('core.auth_success')); } catch(e) {} },
    
    async saveSettings() {
        I18nManager.setLang(document.getElementById('sys-lang-select').value); const st = {}; const bType = this.bootConfig?.type;
        
        // ⚡ 捕获自动锁定时间设置
        this.config.auto_lock = parseInt(document.getElementById('sys-auto-lock-select').value) || 0;
        
        if (document.getElementById('set-chk-local').checked || bType === 'local') st.local = true;
        if (document.getElementById('set-chk-github').checked || bType === 'github') { st.github = { token: document.getElementById('set-gh-token').value.trim(), repo: document.getElementById('set-gh-repo').value.trim() }; if (bType === 'github') { this.bootConfig.token = st.github.token; this.bootConfig.repo = st.github.repo; } }
        if (document.getElementById('set-chk-api').checked || bType === 'api') { st.api = { url: document.getElementById('set-api-url').value.trim(), token: document.getElementById('set-api-token').value.trim() }; if (bType === 'api') { this.bootConfig.url = st.api.url; this.bootConfig.token = st.api.token; } }
        this.config.storage = st;
        try { 
            await this.saveSysConfig(); await this.saveEncryptedBootConfig(); 
            this._setupDataSources(); 
            
            // ⚡ 重置自动锁定的时间与检测
            this.startAutoLock();
            
            document.getElementById('sys-settings-modal').style.display = 'none'; SystemUI.showToast(I18nManager.t('core.save') + " (OK)"); 
            if (this._currentPlugin && typeof this._currentPlugin.onConfigChange === 'function') { this._currentPlugin.onConfigChange(); } 
        } catch (e) { SystemUI.showToast(`${I18nManager.t('core.save_failed')}: ${e.message}`); }
    },
    
    _loadScript(src) { return new Promise((resolve, reject) => { if (document.querySelector(`script[src="${src}"]`)) return resolve(); const script = document.createElement('script'); script.src = src; script.onload = resolve; script.onerror = () => reject(new Error(`Failed to load ${src}`)); document.body.appendChild(script); }); },
    _loadStyle(href) { if (document.querySelector(`link[href="${href}"]`)) return; const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.appendChild(link); },
    
    loadLibrary(type, filename) {
        if (type === 'script' || type === 'js') { return this._loadScript(`libs/scripts/${filename}`); } 
        else if (type === 'css' || type === 'style') { this._loadStyle(`libs/css/${filename}`); return Promise.resolve(); } 
        else if (type === 'image' || type === 'img') { return Promise.resolve(`libs/images/${filename}`); }
        return Promise.reject(new Error("Unknown library type: " + type));
    },
    
    async loadPlugins() {
        const listEl = document.getElementById('dock-plugins-list'); listEl.innerHTML = '';
        if (!window.SystemPlugins || window.SystemPlugins.length === 0) { listEl.innerHTML = `<div style="padding:15px; color:var(--sys-text-muted); font-size:0.9rem; text-align:center; font-weight:500;" data-i18n="core.no_plugins">${I18nManager.t('core.no_plugins')}</div>`; return; }
        const i18nPromises = window.SystemPlugins.map(plugin => { if (plugin.i18n && !document.querySelector(`script[src="${plugin.i18n}"]`)) { return this._loadScript(plugin.i18n).catch(e => {}); } return Promise.resolve(); });
        await Promise.all(i18nPromises);
        window.SystemPlugins.forEach(plugin => {
            const btn = document.createElement('div'); btn.className = 'dock-item'; const text = I18nManager.t(plugin.nameI18nKey) || plugin.id; btn.title = text; const iconName = plugin.icon || 'extension'; 
            btn.innerHTML = `<span class="material-symbols-rounded">${iconName}</span><span class="plugin-name" ${plugin.nameI18nKey ? `data-i18n="${plugin.nameI18nKey}"` : ''}>${text}</span>`;
            btn.onclick = function() { SystemCore.activatePlugin(plugin, this); }; listEl.appendChild(btn);
        });
    }
};

document.getElementById('sys-btn-bind').onclick = () => SystemCore.handleBindStorage();
document.getElementById('sys-btn-unlock').onclick = () => SystemCore.handleAuth();
document.getElementById('sys-pwd').onkeydown = (e) => { if (e.key === 'Enter') SystemCore.handleAuth(); };
// ⚡ 让确认密码框也能回车触发
document.getElementById('sys-pwd2').onkeydown = (e) => { if (e.key === 'Enter') SystemCore.handleAuth(); };
if(document.getElementById('sys-confirm-btn')) { document.getElementById('sys-confirm-btn').onclick = () => { if (SystemUI.confirmCallback) SystemUI.confirmCallback(); SystemUI.closeConfirm(); }; }
window.addEventListener('DOMContentLoaded', () => SystemCore.boot());