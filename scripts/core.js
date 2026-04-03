/**
 * Privacy OS 核心层 (V9.8 终极一致性与无损存储版)
 * 架构：无冗余 Conflict 状态机 + 内容智能嗅探(BOM/0x00) + 级联软删 + GC 垃圾回收
 * 国际化：全量补全深层 UI 交互组件与底层 Daemon 的多语言支持
 */

const CoreUtils = {
    sha256: async function(str) { const buffer = new TextEncoder().encode(str); const hashBuffer = await crypto.subtle.digest('SHA-256', buffer); return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join(''); },
    bufToBase64: async function(buf) { return new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(new Blob([buf])); }); },
    base64ToBuf: function(base64) { const binary_string = atob(base64); const bytes = new Uint8Array(binary_string.length); for (let i = 0; i < binary_string.length; i++) bytes[i] = binary_string.charCodeAt(i); return bytes.buffer; },
    bufToHex: function(buffer) { return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join(''); },
    hexToBuf: function(hex) { if (!hex) return new Uint8Array(0).buffer; const bytes = new Uint8Array(Math.ceil(hex.length / 2)); for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16); return bytes.buffer; }
};

const CoreCrypto = (() => {
    let _aesKeyL1 = null; let _aesKeyL2 = null; let _isReady = false;
    const encodeText = (str) => new TextEncoder().encode(str);
    const decodeText = (buf) => new TextDecoder().decode(buf);

    return {
        initKeys: async function(pwd, baseSaltHex = null) {
            let saltUint8;
            if (!baseSaltHex) { saltUint8 = crypto.getRandomValues(new Uint8Array(32)); baseSaltHex = CoreUtils.bufToHex(saltUint8); } 
            else { saltUint8 = new Uint8Array(CoreUtils.hexToBuf(baseSaltHex)); }

            const keyMat = await crypto.subtle.importKey("raw", encodeText(pwd), { name: "PBKDF2" }, false, ["deriveKey"]);
            const salt1 = new Uint8Array([...saltUint8, ...encodeText("_Level_1")]); const salt2 = new Uint8Array([...saltUint8, ...encodeText("_Level_2")]);
            
            _aesKeyL1 = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt1, iterations: 600000, hash: "SHA-256" }, keyMat, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
            _aesKeyL2 = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt2, iterations: 600000, hash: "SHA-256" }, keyMat, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
            _isReady = true; return baseSaltHex; 
        },
        clearKeys: function() { _aesKeyL1 = null; _aesKeyL2 = null; _isReady = false; },
        
        encrypt: async function(plainText) {
            if (!_isReady) throw new Error("Keys not initialized");
            const compressedBuf = pako.deflate(plainText); 
            const headerZip = encodeText("ZIP:");
            const payloadBuf = new Uint8Array(headerZip.length + compressedBuf.length);
            payloadBuf.set(headerZip); payloadBuf.set(compressedBuf, headerZip.length);
            
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
            
            const iv1 = encryptedUint8.slice(4, 16); const iv2 = encryptedUint8.slice(16, 28); const cipherText = encryptedUint8.slice(28);
            try {
                const decrypted1 = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv2 }, _aesKeyL2, cipherText);
                const payloadBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv1 }, _aesKeyL1, decrypted1);
                const header = decodeText(new Uint8Array(payloadBuf.slice(0, 4)));
                if (header === "ZIP:") return pako.inflate(new Uint8Array(payloadBuf.slice(4)), { to: 'string' });
                else return decodeText(payloadBuf);
            } catch (e) { throw new Error("DataCorruptedOrWrongPassword"); }
        },

        tempDecrypt: async function(encryptedUint8, pwd, baseSaltHex) {
            const saltUint8 = new Uint8Array(CoreUtils.hexToBuf(baseSaltHex));
            const keyMat = await crypto.subtle.importKey("raw", encodeText(pwd), { name: "PBKDF2" }, false, ["deriveKey"]);
            const salt1 = new Uint8Array([...saltUint8, ...encodeText("_Level_1")]); 
            const salt2 = new Uint8Array([...saltUint8, ...encodeText("_Level_2")]);
            const tKey1 = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt1, iterations: 600000, hash: "SHA-256" }, keyMat, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
            const tKey2 = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt2, iterations: 600000, hash: "SHA-256" }, keyMat, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
            
            if (encryptedUint8.byteLength < 28) throw new Error("File too small");
            const magic = decodeText(encryptedUint8.slice(0, 4));
            if (magic !== "SEC2") throw new Error("Format Corrupted");
            
            const iv1 = encryptedUint8.slice(4, 16); const iv2 = encryptedUint8.slice(16, 28); const cipherText = encryptedUint8.slice(28);
            try {
                const decrypted1 = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv2 }, tKey2, cipherText);
                const payloadBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv1 }, tKey1, decrypted1);
                const header = decodeText(new Uint8Array(payloadBuf.slice(0, 4)));
                if (header === "ZIP:") return pako.inflate(new Uint8Array(payloadBuf.slice(4)), { to: 'string' });
                else return decodeText(payloadBuf);
            } catch (e) { throw new Error("DataCorruptedOrWrongPassword"); }
        }
    };
})();

const CoreDB = {
    async init() { return new Promise((resolve, reject) => { const req = indexedDB.open('SysDB', 1); req.onupgradeneeded = e => e.target.result.createObjectStore('handles'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); },
    async set(k, v) { const db = await this.init(); return new Promise((resolve, reject) => { const tx = db.transaction('handles', 'readwrite'); tx.objectStore('handles').put(v, k); tx.oncomplete = resolve; tx.onerror = reject; }); },
    async get(k) { const db = await this.init(); return new Promise((resolve, reject) => { const req = db.transaction('handles', 'readonly').objectStore('handles').get(k); req.onsuccess = () => resolve(req.result); req.onerror = reject; }); }
};

class BaseDataSource {
    constructor(id, type, config) { this.id = id; this.type = type; this.config = config; this.isOffline = false; }
    async readPhysicalFile(physicalPath) { throw new Error("Not implemented"); }
    async commitPhysical(pluginId, additions, deletions) { throw new Error("Not implemented"); }
    async writeRawFile(path, contentUint8) { throw new Error("Not implemented"); }
    async pullRawFilelist(pluginId) { return await this.readPhysicalFile(`${pluginId}/filelist`); }
    async deletePhysicalFile(physicalPath) { throw new Error("Not implemented"); }
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
        for (let del of deletions) { await this.deletePhysicalFile(del.path); }
    }
    async writeRawFile(path, contentUint8) {
        const parts = path.split('/'); let dir = this.config.handle;
        for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i], {create: true});
        const writable = await (await dir.getFileHandle(parts[parts.length - 1], {create: true})).createWritable();
        await writable.write(contentUint8); await writable.close();
    }
    async deletePhysicalFile(physicalPath) {
        const parts = physicalPath.split('/'); let dir = this.config.handle;
        try {
            for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i]);
            await dir.removeEntry(parts[parts.length - 1]);
        } catch(e) {}
    }
}

class GithubDataSource extends BaseDataSource {
    async readPhysicalFile(physicalPath) {
        let res;
        try { res = await fetch(`https://api.github.com/repos/${this.config.repo}/contents/${physicalPath}?_t=${Date.now()}`, { headers: { 'Authorization': `token ${this.config.token}`, 'Accept': 'application/vnd.github.v3.raw' }, cache: 'no-store' }); } 
        catch (e) { throw new Error("NETWORK_OFFLINE"); }
        if (res.status === 404) return null;
        if (res.status === 401 || res.status === 403) throw new Error("AUTH_FAILED");
        if (!res.ok) throw new Error(`SERVER_ERROR_${res.status}`);
        const text = await res.text();
        if (text.startsWith("SEC2:")) return new Uint8Array(CoreUtils.base64ToBuf(text.substring(5)));
        throw new Error(`DataCorrupted: ${physicalPath}`);
    }
    async commitPhysical(pluginId, additions, deletions) {
        const [owner, repo] = this.config.repo.split('/');
        const query = `query { repository(owner: "${owner}", name: "${repo}") { defaultBranchRef { name target { ... on Commit { oid } } } } }`;
        const qRes = await fetch('https://api.github.com/graphql', { method: 'POST', headers: { 'Authorization': `bearer ${this.config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
        const qData = await qRes.json();
        if (!qData.data || !qData.data.repository.defaultBranchRef) throw new Error("Repo Error");
        const expectedHeadOid = qData.data.repository.defaultBranchRef.target.oid;
        const branchName = qData.data.repository.defaultBranchRef.name;
        
        const ghAdditions = await Promise.all(additions.map(async add => {
            const rawBase64 = await CoreUtils.bufToBase64(add.content);
            return { path: add.path, contents: btoa(`SEC2:${rawBase64}`) };
        }));
        const mutation = `mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }`;
        const variables = { input: { branch: { repositoryNameWithOwner: this.config.repo, branchName }, message: { headline: `VFS Auto Sync` }, fileChanges: { additions: ghAdditions, deletions: deletions.map(d=>({path: d.path})) }, expectedHeadOid } };
        const mRes = await fetch('https://api.github.com/graphql', { method: 'POST', headers: { 'Authorization': `bearer ${this.config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: mutation, variables }) });
        if (!mRes.ok) throw new Error("GitHub Commit Failed");
    }
    async writeRawFile(path, contentUint8) {
        let fileSha = null;
        const checkRes = await fetch(`https://api.github.com/repos/${this.config.repo}/contents/${path}?_t=${Date.now()}`, { headers: { 'Authorization': `token ${this.config.token}` }, cache: 'no-store' });
        if (checkRes.ok) { fileSha = (await checkRes.json()).sha; }
        const rawBase64 = await CoreUtils.bufToBase64(contentUint8);
        const putRes = await fetch(`https://api.github.com/repos/${this.config.repo}/contents/${path}`, { method: 'PUT', headers: { 'Authorization': `token ${this.config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `Update`, content: btoa(`SEC2:${rawBase64}`), sha: fileSha }) });
        if (!putRes.ok) throw new Error("GitHub PUT failed");
    }
    async deletePhysicalFile(physicalPath) {}
}

class ApiDataSource extends BaseDataSource {
    async readPhysicalFile(physicalPath) {
        let res;
        try { res = await fetch(`${this.config.url}?path=${physicalPath}&_t=${Date.now()}`, { headers: { 'Authorization': `Bearer ${this.config.token || ''}` }, cache: 'no-store' }); } 
        catch (e) { throw new Error("NETWORK_OFFLINE"); }
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`SERVER_ERROR`);
        return new Uint8Array(await res.arrayBuffer());
    }
    async commitPhysical(pluginId, additions, deletions) {
        for (let add of additions) {
            const b64 = await CoreUtils.bufToBase64(add.content);
            await fetch(this.config.url, { method: 'POST', headers: { 'Authorization': `Bearer ${this.config.token || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: add.path, content: b64 }) });
        }
    }
    async writeRawFile(path, contentUint8) {
        const b64 = await CoreUtils.bufToBase64(contentUint8);
        await fetch(this.config.url, { method: 'POST', headers: { 'Authorization': `Bearer ${this.config.token || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path, content: b64 }) });
    }
    async deletePhysicalFile(physicalPath) {} 
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
    }
};

const VFS_State = { L0: {}, L1: {}, LLocal: {}, LRemote: {} }; 

const SystemVFS = {
    _daemons: {},        
    _isSyncing: {},      
    _isMounting: false,  

    _findActiveChild(pluginId, parentId, name) {
        const L0 = VFS_State.L0[pluginId];
        if (!L0) return null;

        for (let id in L0.filelist) {
            const node = L0.filelist[id];
            if (node.parentid === parentId && node.name === name && node.deleted < 0) {
                return { id, type: node.type, node: node };
            }
        }
        return null;
    },

    _garbageCollectTombstones(pluginId) {
        const L0 = VFS_State.L0[pluginId];
        const L1 = VFS_State.L1[pluginId];
        const LLocal = VFS_State.LLocal[pluginId];
        if (!L0) return;

        const hasRemote = !!this._getActiveRemoteSource();
        const hasLocal = !!DataSourceManager.get('local_main');

        let cleanedCount = 0;
        for (let id in L0.filelist) {
            const node = L0.filelist[id];
            
            if (node.deleted <= 0) continue;
            if (hasRemote && node.is_dirty_meta) continue;
            if (hasLocal) {
                const isLocalTracking = LLocal && LLocal.filelist && LLocal.filelist[id];
                if (isLocalTracking && LLocal.filelist[id].deleted !== node.deleted) continue;
            }

            delete L0.filelist[id];
            if (L0.files && L0.files[id] !== undefined) delete L0.files[id];
            
            if (L1 && L1.filelist) {
                delete L1.filelist[id];
                if (L1.unsynced) delete L1.unsynced[id];
                if (L1.cache) delete L1.cache[id];
            }
            
            if (LLocal && LLocal.filelist) {
                delete LLocal.filelist[id];
            }
            
            cleanedCount++;
        }
        
        if (cleanedCount > 0) {
            console.log(`[VFS GC] 级联物理清理了 ${cleanedCount} 个陈旧墓碑记录`);
            if (this._forceSaveL1) this._forceSaveL1(pluginId);
        }
    },

    _initPluginState(pluginId) { 
        if (!VFS_State.L0[pluginId]) VFS_State.L0[pluginId] = { filelist: {}, files: {}, write_time: 0 };
        if (!VFS_State.L1[pluginId]) VFS_State.L1[pluginId] = { filelist: {}, unsynced: {}, cache: {}, sync_time: 0, next_tick: 0 };
        if (!VFS_State.LLocal[pluginId]) VFS_State.LLocal[pluginId] = { filelist: {}, sync_time: 0, next_tick: 0 };
        if (!VFS_State.LRemote[pluginId]) VFS_State.LRemote[pluginId] = { filelist: {} };
    },

    _migrateLegacyData(filelist) {
        let isMigrated = false;
        for (let fid in filelist) {
            const meta = filelist[fid];
            if (meta.sync_version_github !== undefined) { meta.sync_version = meta.sync_version_github; isMigrated = true; }
            Object.keys(meta).forEach(k => { if (k.startsWith('sync_version_') && k !== 'sync_version') { delete meta[k]; isMigrated = true; } });
            if (meta.sync_version === undefined) { meta.sync_version = 0; isMigrated = true; }
        }
        return isMigrated;
    },

    _getActiveRemoteSource() {
        const type = SystemCore.bootConfig?.type;
        if (type === 'github') return DataSourceManager.get('github_main');
        if (type === 'api') return DataSourceManager.get('api_main');
        const st = SystemCore.config?.storage || {};
        if (st.github) return DataSourceManager.get('github_main');
        if (st.api) return DataSourceManager.get('api_main');
        return null;
    },

    async _forceSaveL1(pluginId) {
        const L1 = VFS_State.L1[pluginId];
        if (!L1) return;
        const encStateUint8 = await CoreCrypto.encrypt(JSON.stringify(L1)); 
        await CoreDB.set(`vfs_state_${pluginId}`, encStateUint8);
    },

    _touchL0(pluginId) {
        const now = Date.now();
        VFS_State.L0[pluginId].write_time = now;
        VFS_State.L1[pluginId].next_tick = now + 3000;    
        VFS_State.LLocal[pluginId].next_tick = now + 10000; 
    },

    _startDaemon(pluginId) {
        if (this._daemons[pluginId]) clearInterval(this._daemons[pluginId]);
        
        this._daemons[pluginId] = setInterval(async () => {
            if (this._isMounting || this._isSyncing[pluginId]) return; 
            
            const now = Date.now();
            const L0 = VFS_State.L0[pluginId];
            const L1 = VFS_State.L1[pluginId];
            const LLocal = VFS_State.LLocal[pluginId];
            
            if (L1.sync_time < L0.write_time && now >= L1.next_tick) {
                await this._reconcileL1(pluginId);
                L1.sync_time = L0.write_time; 
            }

            if (LLocal.sync_time < L0.write_time && now >= LLocal.next_tick) {
                const isSuccess = await this._reconcileLLocal(pluginId);
                if (isSuccess) {
                    LLocal.sync_time = L0.write_time; 
                } else {
                    LLocal.next_tick = now + 10000; 
                }
            }
        }, 1000); 
    },

    _pauseAllDaemons() { this._isMounting = true; },
    _resumeAllDaemons() { this._isMounting = false; },
    _killAllDaemons() { for (let pid in this._daemons) { clearInterval(this._daemons[pid]); delete this._daemons[pid]; } },

    async _reconcileL1(pluginId) {
        const L0 = VFS_State.L0[pluginId]; const L1 = VFS_State.L1[pluginId];
        let changed = false;
        
        for (let fid in L0.filelist) {
            const n0 = L0.filelist[fid]; const n1 = L1.filelist[fid];
            if (!n1 || n0.sha256 !== n1.sha256 || n0.updated_at !== n1.updated_at || n0.deleted !== n1.deleted) {
                L1.filelist[fid] = JSON.parse(JSON.stringify(n0));
                if (n0.type !== 'directory' && n0.deleted < 0 && L0.files[fid] !== undefined) {
                    L1.unsynced[fid] = L0.files[fid];
                }
                changed = true;
            }
        }
        for (let fid in L1.filelist) {
            if (!L0.filelist[fid]) { delete L1.filelist[fid]; delete L1.unsynced[fid]; delete L1.cache[fid]; changed = true; }
        }
        if (changed) {
            await this._forceSaveL1(pluginId); 
        }
    },

    async _reconcileLLocal(pluginId, forceFlush = false) {
        const localSource = DataSourceManager.get('local_main');
        const L0 = VFS_State.L0[pluginId]; const LLocal = VFS_State.LLocal[pluginId];
        
        if (!localSource || !L0 || !LLocal) return false;

        let filesToWrite = []; let filesToDelete = []; let hasChanges = false; let pulledFids = [];

        for (let fid in L0.filelist) {
            const n0 = L0.filelist[fid]; const nLoc = LLocal.filelist[fid];
            if (!nLoc || n0.sha256 !== nLoc.sha256 || n0.updated_at !== nLoc.updated_at || n0.deleted !== nLoc.deleted) {
                if (n0.deleted > 0) {
                    filesToDelete.push(`${pluginId}/${fid}`);
                } else if (n0.type !== 'directory') {
                    let content = L0.files[fid];
                    if (content === undefined) {
                        content = await this._fetchRemoteContentFallback(pluginId, fid);
                        if (content !== undefined) L0.files[fid] = content;
                    }
                    if (content !== undefined) filesToWrite.push({ path: `${pluginId}/${fid}`, content: await CoreCrypto.encrypt(content) });
                }
                LLocal.filelist[fid] = JSON.parse(JSON.stringify(n0));
                hasChanges = true;
            }
        }

        for (let fid in LLocal.filelist) {
            if (!L0.filelist[fid]) {
                try {
                    const buf = await localSource.readPhysicalFile(`${pluginId}/${fid}`);
                    if (buf) {
                        const content = await CoreCrypto.decrypt(buf);
                        L0.files[fid] = content;
                        L0.filelist[fid] = JSON.parse(JSON.stringify(LLocal.filelist[fid]));
                        pulledFids.push(fid);
                    }
                } catch(e) { 
                    filesToDelete.push(`${pluginId}/${fid}`); delete LLocal.filelist[fid]; hasChanges = true; 
                }
            }
        }

        if (hasChanges || forceFlush) {
            try {
                for (let path of filesToDelete) { await localSource.deletePhysicalFile(path).catch(()=>{}); }
                if (filesToWrite.length > 0) await Promise.all(filesToWrite.map(c => localSource.writeRawFile(c.path, c.content)));
                const filelistEnc = await CoreCrypto.encrypt(JSON.stringify(LLocal.filelist));
                await localSource.writeRawFile(`${pluginId}/filelist`, filelistEnc);
                return true; 
            } catch (e) { 
                console.error(`[Daemon] LLOCAL Sync Failed. Permission lost or File locked.`, e); 
                return false; 
            }
        }

        if (pulledFids.length > 0 && SystemCore._currentPlugin) {
            if (typeof SystemCore._currentPlugin.renderTree === 'function') SystemCore._currentPlugin.renderTree();
            if (typeof SystemCore._currentPlugin.onFilesPulled === 'function') SystemCore._currentPlugin.onFilesPulled(pulledFids);
        }
        
        return true; 
    },

    async _fetchRemoteContentFallback(pluginId, fid) {
        const remoteSource = this._getActiveRemoteSource();
        if (!remoteSource) return undefined;
        try {
            const encData = await remoteSource.readPhysicalFile(`${pluginId}/${fid}`);
            if (encData) return await CoreCrypto.decrypt(encData);
        } catch(e) { return undefined; }
    },

    async bootSyncAllPlugins() {
        const plugins = window.SystemPlugins || [];
        for (let i = 0; i < plugins.length; i++) {
            const p = plugins[i];
            const percent = 40 + Math.floor((i / plugins.length) * 30);
            SystemUI.updateBootProgress(percent, window.I18nManager ? I18nManager.t('core.boot_waking_base', p.id) : `Booting ${p.id}...`);
            await this._bootSyncSinglePlugin(p.id);
        }
    },

    async _bootSyncSinglePlugin(pluginId) {
        this._initPluginState(pluginId);
        const L0 = VFS_State.L0[pluginId]; const L1 = VFS_State.L1[pluginId]; const LLocal = VFS_State.LLocal[pluginId];

        const encCachedBuf = await CoreDB.get(`vfs_state_${pluginId}`);
        if (encCachedBuf) {
            try {
                const cacheState = JSON.parse(await CoreCrypto.decrypt(encCachedBuf));
                const tempFilelist = cacheState.filelist || {};
                const tempUnsynced = cacheState.unsynced || {};
                const tempCache = cacheState.cache || {};
                for (let fid in tempFilelist) {
                    if (tempFilelist[fid].type === 'directory') continue;
                    let content = tempUnsynced[fid] !== undefined ? tempUnsynced[fid] : tempCache[fid];
                    if (content !== undefined) {
                        const realHash = await CoreUtils.sha256(content);
                        if (realHash !== tempFilelist[fid].sha256) tempFilelist[fid].sha256 = realHash;
                    }
                }
                L1.filelist = tempFilelist; L1.unsynced = tempUnsynced; L1.cache = tempCache;
                this._migrateLegacyData(L1.filelist);
            } catch(e) { await CoreDB.set(`vfs_state_${pluginId}`, null); }
        }

        L0.filelist = JSON.parse(JSON.stringify(L1.filelist));
        for (let fid in L0.filelist) {
            if (L0.filelist[fid].type !== 'directory') L0.files[fid] = L1.unsynced[fid] !== undefined ? L1.unsynced[fid] : L1.cache[fid];
        }

        const localSource = DataSourceManager.get('local_main');
        const remoteSource = this._getActiveRemoteSource();

        if (localSource) {
            try {
                const localListBuf = await localSource.pullRawFilelist(pluginId);
                if (localListBuf) { LLocal.filelist = JSON.parse(await CoreCrypto.decrypt(localListBuf)); this._migrateLegacyData(LLocal.filelist); }
            } catch (e) { } 
        }
        
        if (remoteSource) {
            try {
                const remoteListBuf = await remoteSource.pullRawFilelist(pluginId);
                if (remoteListBuf) { 
                    VFS_State.LRemote[pluginId].filelist = JSON.parse(await CoreCrypto.decrypt(remoteListBuf)); 
                    this._migrateLegacyData(VFS_State.LRemote[pluginId].filelist); 
                    for(let fid in VFS_State.LRemote[pluginId].filelist) {
                        if(!L0.filelist[fid]) {
                            if (VFS_State.LRemote[pluginId].filelist[fid].deleted > 0) continue;
                            L0.filelist[fid] = JSON.parse(JSON.stringify(VFS_State.LRemote[pluginId].filelist[fid]));
                        }
                    }
                }
            } catch (e) { }
        }

        const now = Date.now();
        VFS_State.L0[pluginId].write_time = now;
        VFS_State.L1[pluginId].sync_time = now; 
        VFS_State.L1[pluginId].next_tick = 0;
        
        VFS_State.LLocal[pluginId].sync_time = 0; 
        VFS_State.LLocal[pluginId].next_tick = now; 
        
        this._startDaemon(pluginId);
    },

    async mountPluginFS(pluginId) {
        if (!VFS_State.L0[pluginId]) await this._bootSyncSinglePlugin(pluginId);
        return true;
    },

    async createNode(pluginId, name, type = 'text', parentid = null, initialContent = "") {
        const L0 = VFS_State.L0[pluginId];
        const nodeId = Math.floor(1000000000 + Math.random() * 9000000000) + '_' + Date.now();
        const sha = type === 'directory' ? "" : await CoreUtils.sha256(initialContent);
        
        L0.filelist[nodeId] = { name, parentid, type, sha256: sha, deleted: -1, updated_at: Date.now(), sync_version: 0, is_dirty_meta: true };
        if (type !== 'directory') L0.files[nodeId] = initialContent;
        this._touchL0(pluginId); return nodeId;
    },

    async writeFile(pluginId, fileId, content) {
        const L0 = VFS_State.L0[pluginId];
        if (!L0 || !L0.filelist[fileId] || L0.filelist[fileId].deleted > 0 || L0.filelist[fileId].type === 'directory') return false;
        const newSha = await CoreUtils.sha256(content);
        if (newSha === L0.filelist[fileId].sha256) return true; 

        L0.filelist[fileId].sha256 = newSha; L0.filelist[fileId].updated_at = Date.now(); 
        L0.files[fileId] = content;
        this._touchL0(pluginId); return true;
    },

    renameNode(pluginId, nodeId, newName) {
        const L0 = VFS_State.L0[pluginId];
        if (!L0 || !L0.filelist[nodeId] || L0.filelist[nodeId].deleted > 0) return false;
        if (L0.filelist[nodeId].name === newName) return true; 
        L0.filelist[nodeId].name = newName; L0.filelist[nodeId].updated_at = Date.now(); 
        this._evalMetaDirty(pluginId, nodeId); this._touchL0(pluginId); return true;
    },

    moveNode(pluginId, nodeId, newParentId) {
        const L0 = VFS_State.L0[pluginId];
        if (!L0 || !L0.filelist[nodeId] || L0.filelist[nodeId].deleted > 0) return false;
        if (L0.filelist[nodeId].parentid === newParentId) return true;
        let curr = newParentId;
        while (curr) { if (curr === nodeId) { SystemUI.showError(window.I18nManager ? I18nManager.t('core.vfs_err_circular_move') : "Circular move detected"); return false; } curr = L0.filelist[curr]?.parentid; }
        
        L0.filelist[nodeId].parentid = newParentId; L0.filelist[nodeId].updated_at = Date.now();
        this._evalMetaDirty(pluginId, nodeId); this._touchL0(pluginId); return true;
    },

    async deleteNode(pluginId, nodeId) {
        const L0 = VFS_State.L0[pluginId];
        if (!L0 || !L0.filelist[nodeId]) return false;

        if (this._pauseAllDaemons) this._pauseAllDaemons();
        
        try {
            const node = L0.filelist[nodeId];
            if (node.deleted > 0) return true;

            const now = Date.now();

            const markDeletedRecursive = (currentId) => {
                const currNode = L0.filelist[currentId];
                if (!currNode || currNode.deleted > 0) return;

                currNode.deleted = now;
                currNode.updated_at = now;
                currNode.is_dirty_meta = true; 

                if (currNode.type === 'text' && L0.files && L0.files[currentId] !== undefined) {
                    delete L0.files[currentId];
                }

                if (currNode.type === 'directory') {
                    for (const childId in L0.filelist) {
                        if (L0.filelist[childId].parentid === currentId) {
                            markDeletedRecursive(childId);
                        }
                    }
                }
            };

            markDeletedRecursive(nodeId);

            if (this._touchL0) this._touchL0(pluginId);
            return true;
        } catch (e) {
            console.error("VFS Delete Error:", e);
            return false;
        } finally {
            if (this._resumeAllDaemons) this._resumeAllDaemons();
        }
    },

    _evalMetaDirty(pluginId, nodeId) {
        const L0 = VFS_State.L0[pluginId]; const LRemote = VFS_State.LRemote[pluginId];
        if (!L0 || !L0.filelist[nodeId]) return;
        const node = L0.filelist[nodeId];
        if (node.sync_version === 0) return; 
        const rNode = LRemote && LRemote.filelist ? LRemote.filelist[nodeId] : null;
        if (!rNode) return; 
        if (node.name === rNode.name && node.parentid === rNode.parentid && node.deleted === rNode.deleted) { delete node.is_dirty_meta; } 
        else { node.is_dirty_meta = true; }
    },

    async readFile(pluginId, fileId) {
        const L0 = VFS_State.L0[pluginId];
        if (!L0 || !L0.filelist[fileId] || L0.filelist[fileId].deleted > 0 || L0.filelist[fileId].type === 'directory') return null;
        if (L0.files[fileId] !== undefined) return L0.files[fileId];

        SystemUI.showSyncOverlay(window.I18nManager ? I18nManager.t('core.sync_pulling_file') : "Pulling file...");
        try {
            let content = null;
            const remoteSource = this._getActiveRemoteSource();
            if (remoteSource) {
                try {
                    const encDataUint8 = await remoteSource.readPhysicalFile(`${pluginId}/${fileId}`);
                    if (encDataUint8) content = await CoreCrypto.decrypt(encDataUint8);
                } catch(e) { } 
            }
            if (content !== null) {
                L0.files[fileId] = content;
                this._touchL0(pluginId); 
            }
            return content;
        } finally { SystemUI.hideSyncOverlay(); }
    },

    async syncCloud(pluginId, isBackground = false) {
        const remoteSource = this._getActiveRemoteSource();
        if (!remoteSource) return false;

        this._isSyncing[pluginId] = true; 
        if (!isBackground) SystemUI.showSyncOverlay(window.I18nManager ? I18nManager.t('core.sync_app_data', pluginId) : `Syncing ${pluginId}...`);
        
        try {
            await this._reconcileL1(pluginId);

            const L0 = VFS_State.L0[pluginId]; const L1 = VFS_State.L1[pluginId]; const LRemote = VFS_State.LRemote[pluginId];
            let encListUint8;
            try { encListUint8 = await remoteSource.pullRawFilelist(pluginId); } catch(e) { remoteSource.isOffline = true; throw e; }

            let remoteList = {};
            if (encListUint8) remoteList = JSON.parse(await CoreCrypto.decrypt(encListUint8));
            this._migrateLegacyData(remoteList);
            LRemote.filelist = remoteList;

            let requiresPush = false; let planAdditions = []; let localChanged = false; let pulledFids = [];
            const allFids = new Set([...Object.keys(L1.filelist), ...Object.keys(remoteList)]);

            for (let fid of allFids) {
                const locNode = L1.filelist[fid]; const remNode = remoteList[fid];
                const isContentDirty = L1.unsynced[fid] !== undefined;
                const isMetaDirty = locNode && locNode.is_dirty_meta === true;
                const isDirtyLocally = isContentDirty || isMetaDirty;
                
                if (locNode && locNode.deleted > 0 && !remNode) continue; 
                const vLoc = locNode ? (locNode.sync_version || 0) : -1;
                const vRem = remNode ? (remNode.sync_version || 0) : -1;

                if (!locNode && remNode) {
                    if (remNode.deleted > 0) continue;

                    L1.filelist[fid] = JSON.parse(JSON.stringify(remNode)); 
                    L0.filelist[fid] = JSON.parse(JSON.stringify(remNode));
                    localChanged = true; pulledFids.push(fid); continue;
                }
                if (locNode && !remNode) {
                    if (locNode.deleted > 0) continue; 
                    requiresPush = true;
                    if (locNode.type !== 'directory') planAdditions.push(fid);
                    continue;
                }
                if (locNode && remNode && locNode.deleted > 0 && remNode.deleted < 0) { requiresPush = true; continue; }
                
                if (locNode && remNode) {
                    const hashesMatch = locNode.sha256 === remNode.sha256;
                    const metaMatches = locNode.name === remNode.name && locNode.parentid === remNode.parentid && locNode.deleted === remNode.deleted;
                    
                    if (hashesMatch && metaMatches && (vLoc !== vRem || isDirtyLocally)) {
                        L1.filelist[fid] = JSON.parse(JSON.stringify(remNode));
                        L0.filelist[fid] = JSON.parse(JSON.stringify(remNode));
                        delete L1.unsynced[fid]; 
                        delete L1.filelist[fid].is_dirty_meta;
                        if (L0.files[fid] !== undefined) L1.cache[fid] = L0.files[fid]; 
                        localChanged = true; this._touchL0(pluginId);
                        continue; 
                    }
                }

                if (vLoc === vRem && !isDirtyLocally) continue;
                if (vLoc === vRem && isDirtyLocally) { requiresPush = true; if (isContentDirty && locNode.type !== 'directory') planAdditions.push(fid); continue; }

                if (vLoc < vRem && !isDirtyLocally) {
                    L1.filelist[fid] = JSON.parse(JSON.stringify(remNode)); L0.filelist[fid] = JSON.parse(JSON.stringify(remNode));
                    delete L1.cache[fid]; delete L0.files[fid]; delete L1.filelist[fid].is_dirty_meta;
                    localChanged = true; pulledFids.push(fid); continue;
                }

                if (vLoc < vRem && isDirtyLocally) { 
                    if (isBackground) return false; 
                    SystemUI.hideSyncOverlay(); return await this._handleConflictUI(pluginId, fid, locNode, remNode, remoteSource); 
                }
                if (vLoc > vRem && !isDirtyLocally) { 
                    if (isBackground) return false; 
                    SystemUI.hideSyncOverlay(); return await this._handleRollbackUI(pluginId, fid, 'clean', vLoc, vRem); 
                }
                if (vLoc > vRem && isDirtyLocally) { 
                    if (isBackground) return false; 
                    SystemUI.hideSyncOverlay(); return await this._handleRollbackUI(pluginId, fid, 'dirty', vLoc, vRem); 
                }
            }

            if (requiresPush) { 
                let additionsPayload = [];
                let safeMemList = JSON.parse(JSON.stringify(L1.filelist));

                for (let fid of planAdditions) {
                    const content = L1.unsynced[fid];
                    if (content === undefined) continue; 
                    safeMemList[fid].sync_version = (safeMemList[fid].sync_version || 0) + 1;
                    additionsPayload.push({ path: `${pluginId}/${fid}`, content: await CoreCrypto.encrypt(content) });
                }
                for(let fid in safeMemList) {
                    const sNode = safeMemList[fid]; const rNode = remoteList[fid];
                    if (sNode.is_dirty_meta || (sNode.deleted > 0 && rNode && rNode.deleted < 0)) {
                        if (!planAdditions.includes(fid)) sNode.sync_version = (sNode.sync_version || 0) + 1;
                    }
                    delete sNode.is_dirty_meta;
                }

                additionsPayload.push({ path: `${pluginId}/filelist`, content: await CoreCrypto.encrypt(JSON.stringify(safeMemList)) });
                await remoteSource.commitPhysical(pluginId, additionsPayload, []);

                L1.filelist = safeMemList; L0.filelist = JSON.parse(JSON.stringify(safeMemList)); 
                for (let fid of planAdditions) {
                    if (L1.unsynced[fid] !== undefined) { L1.cache[fid] = L1.unsynced[fid]; delete L1.unsynced[fid]; }
                }
                this._touchL0(pluginId);
            }

            if (localChanged || requiresPush) { 
                await this._forceSaveL1(pluginId);

                if (SystemCore._currentPlugin) {
                    if (typeof SystemCore._currentPlugin.updateDirtyState === 'function') SystemCore._currentPlugin.updateDirtyState();
                    if (typeof SystemCore._currentPlugin.renderTree === 'function') SystemCore._currentPlugin.renderTree(); 
                    if (typeof SystemCore._currentPlugin.renderTabs === 'function') SystemCore._currentPlugin.renderTabs(); 
                    if (typeof SystemCore._currentPlugin.onFilesPulled === 'function' && pulledFids.length > 0) SystemCore._currentPlugin.onFilesPulled(pulledFids);
                }
            }

            this._garbageCollectTombstones(pluginId);

            if (!isBackground) SystemUI.showToast(window.I18nManager ? I18nManager.t('core.sync_success') : 'Sync Success');
            return true;

        } catch (e) {
            if (isBackground && (e.message === 'NETWORK_OFFLINE' || e.message === 'AUTH_FAILED' || e.message.includes('Failed to fetch') || e.message === 'Repo Error')) return false;
            const errTitle = window.I18nManager ? I18nManager.t('core.sync_exception') || 'Sync Exception' : 'Sync Exception';
            SystemUI.showError(`${errTitle} [${pluginId}]:\n\n${e.message}`); return false;
        } finally { 
            this._isSyncing[pluginId] = false; 
            if (!isBackground) SystemUI.hideSyncOverlay(true); 
        }
    },

    async _handleConflictUI(pluginId, fid, locNode, remNode, remoteSource) {
        SystemUI.showSyncOverlay(window.I18nManager ? I18nManager.t('core.diff_loading') : 'Loading diff...');
        let cloudContent = "";
        try {
            const encDataUint8 = await remoteSource.readPhysicalFile(`${pluginId}/${fid}`);
            if (encDataUint8) cloudContent = await CoreCrypto.decrypt(encDataUint8);
        } catch(e) { }
        SystemUI.hideSyncOverlay(true);

        const L0 = VFS_State.L0[pluginId]; const L1 = VFS_State.L1[pluginId];
        const localContent = L1.unsynced[fid] !== undefined ? L1.unsynced[fid] : L0.files[fid];

        return new Promise(resolve => {
            SystemUI.showConflictDialog(pluginId, fid, locNode, remNode, localContent, cloudContent, remoteSource, async (choice, mergedContent) => {
                if (choice === 'local') {
                    L1.filelist[fid].sync_version = remNode.sync_version; L0.filelist[fid].sync_version = remNode.sync_version;
                    this._touchL0(pluginId); resolve(await this.syncCloud(pluginId));
                } else if (choice === 'cloud') {
                    L1.filelist[fid] = JSON.parse(JSON.stringify(remNode)); L0.filelist[fid] = JSON.parse(JSON.stringify(remNode));
                    delete L1.unsynced[fid]; delete L1.cache[fid]; delete L0.files[fid]; delete L1.filelist[fid].is_dirty_meta;
                    this._touchL0(pluginId); 
                    await this._forceSaveL1(pluginId); 
                    if (SystemCore._currentPlugin && typeof SystemCore._currentPlugin.onFilesPulled === 'function') SystemCore._currentPlugin.onFilesPulled([fid]);
                    resolve(true); 
                } else if (choice === 'merge') {
                    L1.filelist[fid].sync_version = remNode.sync_version; L0.filelist[fid].sync_version = remNode.sync_version;
                    L1.unsynced[fid] = mergedContent; L0.files[fid] = mergedContent;
                    this._touchL0(pluginId); 
                    resolve(await this.syncCloud(pluginId));
                } else { resolve(false); } 
            });
        });
    },

    async _handleRollbackUI(pluginId, fid, type, vLoc, vRem) {
        return new Promise(resolve => {
            SystemUI.showRollbackDialog(pluginId, fid, type, vLoc, vRem, async (choice) => {
                const L0 = VFS_State.L0[pluginId]; const L1 = VFS_State.L1[pluginId];
                if (choice === 'force_push') {
                    if (type === 'clean' && L1.cache[fid] !== undefined) L1.unsynced[fid] = L1.cache[fid];
                    L1.filelist[fid].sync_version = vRem; L0.filelist[fid].sync_version = vRem;
                    this._touchL0(pluginId); resolve(await this.syncCloud(pluginId));
                } else if (choice === 'accept_rollback') {
                    const remNode = VFS_State.LRemote[pluginId].filelist[fid];
                    L1.filelist[fid] = JSON.parse(JSON.stringify(remNode)); L0.filelist[fid] = JSON.parse(JSON.stringify(remNode));
                    delete L1.unsynced[fid]; delete L1.cache[fid]; delete L0.files[fid]; delete L1.filelist[fid].is_dirty_meta;
                    this._touchL0(pluginId); 
                    await this._forceSaveL1(pluginId); 
                    if (SystemCore._currentPlugin && typeof SystemCore._currentPlugin.onFilesPulled === 'function') SystemCore._currentPlugin.onFilesPulled([fid]);
                    resolve(true);
                } else { resolve(false); }
            });
        });
    },

    async exportNode(pluginId, nodeId = null) {
        if (!window.showDirectoryPicker) { SystemUI.showError(window.I18nManager ? I18nManager.t('core.err_no_fs_api') : "FS API Not Supported"); return false; }
        const L0 = VFS_State.L0[pluginId]; if (!L0) return false;

        const writeContentToFile = async (fileHandle, content) => {
            const writable = await fileHandle.createWritable();
            let writeData = content || "";
            if (typeof content === 'string' && content.startsWith('data:')) {
                try {
                    const res = await fetch(content);
                    writeData = await res.blob(); 
                } catch (e) {
                    console.warn("Base64 decode failed, fallback to string");
                }
            }
            await writable.write(writeData); 
            await writable.close();
        };

        try {
            if (nodeId && L0.filelist[nodeId] && L0.filelist[nodeId].type !== 'directory') {
                const node = L0.filelist[nodeId];
                const fileHandle = await window.showSaveFilePicker({ suggestedName: node.name });
                const content = await this.readFile(pluginId, nodeId);
                await writeContentToFile(fileHandle, content);
                return true;
            }
            
            const localDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            SystemUI.showSyncOverlay(window.I18nManager ? I18nManager.t('core.sync_exporting_local') : "Exporting...");
            
            const exportRecursive = async (vfsParentId, currentLocalHandle) => {
                const children = Object.keys(L0.filelist).filter(id => L0.filelist[id].parentid === vfsParentId && L0.filelist[id].deleted < 0);
                for (let childId of children) {
                    const node = L0.filelist[childId];
                    if (node.type === 'directory') {
                        const subDirHandle = await currentLocalHandle.getDirectoryHandle(node.name, { create: true });
                        await exportRecursive(childId, subDirHandle);
                    } else {
                        const content = await this.readFile(pluginId, childId);
                        const fileHandle = await currentLocalHandle.getFileHandle(node.name, { create: true });
                        await writeContentToFile(fileHandle, content);
                    }
                }
            };
            
            let rootHandle = localDirHandle;
            if (nodeId && L0.filelist[nodeId]) { rootHandle = await localDirHandle.getDirectoryHandle(L0.filelist[nodeId].name, { create: true }); }
            await exportRecursive(nodeId, rootHandle); 
            return true;
        } catch (e) {
            if (e.name !== 'AbortError') SystemUI.showError((window.I18nManager ? I18nManager.t('core.err_export_failed', '') : "Export Failed: ") + e.message); return false;
        } finally { SystemUI.hideSyncOverlay(true); }
    },

    async importNode(pluginId, targetParentId = null, type = 'file') {
        if (!window.showDirectoryPicker) { SystemUI.showError(window.I18nManager ? I18nManager.t('core.err_no_fs_api') : "FS API Not Supported"); return false; }
        
        const L0 = VFS_State.L0[pluginId];
        if (!L0) return false;

        const generateId = () => Math.floor(1000000000 + Math.random() * 9000000000) + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

        const readFileContentSafe = async (file) => {
            const isBinaryFile = async (f) => {
                if (f.type && f.type.startsWith('text/')) return false; 
                const slice = f.slice(0, 4096);
                const buffer = await slice.arrayBuffer();
                const bytes = new Uint8Array(buffer);

                if (bytes.length === 0) return false; 

                if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return false; 
                if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return false; 
                if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return false; 
                if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0xFE && bytes[3] === 0xFF) return false; 

                for (let i = 0; i < bytes.length; i++) {
                    if (bytes[i] === 0) return true; 
                }
                return false; 
            };

            const isBinary = await isBinaryFile(file);

            if (!isBinary) {
                return await file.text(); 
            } else {
                return await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(file); 
                });
            }
        };

        if (!SystemUI.showImportConflict) {
            SystemUI.showImportConflict = function(name) {
                return new Promise(resolve => {
                    let el = document.getElementById('sys-import-conflict-modal');
                    if (!el) {
                        el = document.createElement('div'); el.id = 'sys-import-conflict-modal'; el.className = 'sys-modal-overlay'; el.style.zIndex = '20005';
                        document.body.appendChild(el);
                    }
                    window._sysImportConflictCb = (choice) => { el.style.display = 'none'; resolve(choice); };
                    
                    const title = window.I18nManager ? I18nManager.t('core.import_conflict_title') || '命名冲突' : '命名冲突';
                    const desc1 = window.I18nManager ? I18nManager.t('core.import_conflict_desc1') || '目标位置已存在同名项目' : '目标位置已存在同名项目';
                    const desc2 = window.I18nManager ? I18nManager.t('core.import_conflict_desc2') || '请选择操作方式：' : '请选择操作方式：';
                    const btnMerge = window.I18nManager ? I18nManager.t('core.btn_merge') || '覆盖 / 合并' : '覆盖 / 合并';
                    const btnKeep = window.I18nManager ? I18nManager.t('core.btn_keep_both') || '保留两者 (自动重命名)' : '保留两者 (自动重命名)';
                    const btnCancel = window.I18nManager ? I18nManager.t('core.btn_cancel_import') || '取消导入' : '取消导入';

                    el.innerHTML = `
                        <div class="sys-modal" style="max-width: 420px; padding: 24px;">
                            <h3 style="margin-bottom: 16px; color: var(--sys-danger); display: flex; align-items: center; gap: 8px;">
                                <span class="material-symbols-rounded">warning</span><span>${title}</span>
                            </h3>
                            <div style="margin-bottom: 24px; font-size: 0.95rem; line-height: 1.5; color: var(--sys-text);">
                                ${desc1} <b style="color: var(--sys-primary);">${name}</b>。<br><br>${desc2}
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 12px;">
                                <button class="sys-btn primary" style="width: 100%; justify-content: center;" onclick="window._sysImportConflictCb('merge')">${btnMerge}</button>
                                <button class="sys-btn" style="width: 100%; justify-content: center; background: var(--sys-surface-hover); color: var(--sys-text);" onclick="window._sysImportConflictCb('rename')">${btnKeep}</button>
                                <button class="sys-btn ghost" style="width: 100%; justify-content: center;" onclick="window._sysImportConflictCb('cancel')">${btnCancel}</button>
                            </div>
                        </div>`;
                    el.style.display = 'flex';
                });
            };
        }

        try {
            if (type === 'file') {
                const fileHandles = await window.showOpenFilePicker({ multiple: true });
                SystemUI.showSyncOverlay(window.I18nManager ? I18nManager.t('core.sync_importing_files') || "正在读取文件..." : "正在读取文件...");
                
                const virtualFiles = [];
                for (const handle of fileHandles) {
                    const file = await handle.getFile(); 
                    const content = await readFileContentSafe(file);
                    virtualFiles.push({ name: file.name, kind: 'file', content });
                }
                SystemUI.hideSyncOverlay();

                let hasConflict = false;
                for (const vf of virtualFiles) {
                    if (this._findActiveChild(pluginId, targetParentId, vf.name)) hasConflict = true;
                }

                let choice = 'merge';
                if (hasConflict) {
                    const multiConflictText = window.I18nManager ? I18nManager.t('core.multi_conflict_files') || '多个冲突文件' : '多个冲突文件';
                    choice = await SystemUI.showImportConflict(multiConflictText);
                    if (choice === 'cancel') return false;
                }

                SystemUI.showSyncOverlay(window.I18nManager ? I18nManager.t('core.sync_writing_workspace') || "正在写入工作区..." : "正在写入工作区...");
                if (this._pauseAllDaemons) this._pauseAllDaemons();
                const now = Date.now();
                let isModified = false;

                for (const vf of virtualFiles) {
                    let finalName = vf.name;
                    if (choice === 'rename' && this._findActiveChild(pluginId, targetParentId, finalName)) {
                        finalName = finalName.replace(/(\.[^.]+)$|$/, `_${Math.random().toString(36).substr(2,4)}$1`);
                    }

                    const existing = this._findActiveChild(pluginId, targetParentId, finalName);
                    let targetId;

                    if (existing) {
                        if (existing.type === 'directory') {
                            finalName += ' (File)';
                            targetId = generateId();
                            const sha = typeof CoreUtils !== 'undefined' && CoreUtils.sha256 ? await CoreUtils.sha256(vf.content) : "";
                            L0.filelist[targetId] = { name: finalName, parentid: targetParentId, type: 'text', sha256: sha, deleted: -1, updated_at: now, sync_version: 0, is_dirty_meta: true };
                            if(!L0.files) L0.files = {};
                            L0.files[targetId] = vf.content;
                        } else {
                            targetId = existing.id;
                            const sha = typeof CoreUtils !== 'undefined' && CoreUtils.sha256 ? await CoreUtils.sha256(vf.content) : "";
                            L0.filelist[targetId].sha256 = sha;
                            L0.filelist[targetId].updated_at = now;
                            L0.filelist[targetId].is_dirty_meta = true;
                            if(!L0.files) L0.files = {};
                            L0.files[targetId] = vf.content;
                            if (this._evalMetaDirty) this._evalMetaDirty(pluginId, targetId);
                        }
                        isModified = true;
                    } else {
                        targetId = generateId();
                        const sha = typeof CoreUtils !== 'undefined' && CoreUtils.sha256 ? await CoreUtils.sha256(vf.content) : "";
                        L0.filelist[targetId] = { name: finalName, parentid: targetParentId, type: 'text', sha256: sha, deleted: -1, updated_at: now, sync_version: 0, is_dirty_meta: true };
                        if(!L0.files) L0.files = {};
                        L0.files[targetId] = vf.content;
                        isModified = true;
                    }
                }
                
                if (isModified && this._touchL0) this._touchL0(pluginId);
                if (this._resumeAllDaemons) this._resumeAllDaemons();

            } else if (type === 'directory') {
                const dirHandle = await window.showDirectoryPicker();
                SystemUI.showSyncOverlay(window.I18nManager ? I18nManager.t('core.sync_scanning_folder') || "正在扫描文件夹结构..." : "正在扫描文件夹结构...");
                
                const virtualTree = { name: dirHandle.name, kind: 'directory', children: [] };
                const scanDir = async (handle, node) => {
                    for await (const entry of handle.values()) {
                        if (entry.kind === 'file') {
                            const file = await entry.getFile(); 
                            const content = await readFileContentSafe(file); 
                            node.children.push({ name: entry.name, kind: 'file', content });
                        } else if (entry.kind === 'directory') {
                            const newDir = { name: entry.name, kind: 'directory', children: [] };
                            node.children.push(newDir);
                            await scanDir(entry, newDir);
                        }
                    }
                };
                await scanDir(dirHandle, virtualTree);
                SystemUI.hideSyncOverlay();

                let choice = 'merge';
                if (this._findActiveChild(pluginId, targetParentId, virtualTree.name)) {
                    choice = await SystemUI.showImportConflict(virtualTree.name);
                    if (choice === 'cancel') return false;
                    if (choice === 'rename') virtualTree.name += `_${Math.random().toString(36).substr(2,4)}`;
                }

                SystemUI.showSyncOverlay(window.I18nManager ? I18nManager.t('core.sync_atomic_writing') || "正在原子化写入工作区..." : "正在原子化写入工作区...");
                if (this._pauseAllDaemons) this._pauseAllDaemons();
                const now = Date.now();
                let isModified = false;

                const applyVirtualTree = async (vNode, currentParentId) => {
                    let targetId;
                    const existing = this._findActiveChild(pluginId, currentParentId, vNode.name);

                    if (existing) {
                        if (vNode.kind === 'directory') {
                            if (existing.type === 'directory') {
                                targetId = existing.id; 
                            } else {
                                vNode.name += ' (Folder)'; 
                                targetId = generateId();
                                L0.filelist[targetId] = { name: vNode.name, parentid: currentParentId, type: 'directory', sha256: "", deleted: -1, updated_at: now, sync_version: 0, is_dirty_meta: true };
                                isModified = true;
                            }
                        } else {
                            if (existing.type === 'text') {
                                targetId = existing.id;
                                const sha = typeof CoreUtils !== 'undefined' && CoreUtils.sha256 ? await CoreUtils.sha256(vNode.content) : "";
                                if (L0.filelist[targetId].sha256 !== sha) {
                                    L0.filelist[targetId].sha256 = sha;
                                    L0.filelist[targetId].updated_at = now;
                                    L0.filelist[targetId].is_dirty_meta = true;
                                    if(!L0.files) L0.files = {};
                                    L0.files[targetId] = vNode.content;
                                    if (this._evalMetaDirty) this._evalMetaDirty(pluginId, targetId);
                                    isModified = true;
                                }
                            } else {
                                vNode.name += ' (File)'; 
                                targetId = generateId();
                                const sha = typeof CoreUtils !== 'undefined' && CoreUtils.sha256 ? await CoreUtils.sha256(vNode.content) : "";
                                L0.filelist[targetId] = { name: vNode.name, parentid: currentParentId, type: 'text', sha256: sha, deleted: -1, updated_at: now, sync_version: 0, is_dirty_meta: true };
                                if(!L0.files) L0.files = {};
                                L0.files[targetId] = vNode.content;
                                isModified = true;
                            }
                        }
                    } else {
                        targetId = generateId();
                        const nType = vNode.kind === 'directory' ? 'directory' : 'text';
                        const sha = nType === 'text' && typeof CoreUtils !== 'undefined' && CoreUtils.sha256 ? await CoreUtils.sha256(vNode.content) : "";
                        L0.filelist[targetId] = { name: vNode.name, parentid: currentParentId, type: nType, sha256: sha, deleted: -1, updated_at: now, sync_version: 0, is_dirty_meta: true };
                        if (nType === 'text') {
                            if(!L0.files) L0.files = {};
                            L0.files[targetId] = vNode.content;
                        }
                        isModified = true;
                    }

                    if (vNode.kind === 'directory' && vNode.children) {
                        for (const child of vNode.children) {
                            await applyVirtualTree(child, targetId);
                        }
                    }
                };

                await applyVirtualTree(virtualTree, targetParentId);

                if (isModified && this._touchL0) this._touchL0(pluginId);
                if (this._resumeAllDaemons) this._resumeAllDaemons();
            }
            return true;
        } catch (e) {
            if (e.name !== 'AbortError') SystemUI.showError((window.I18nManager ? I18nManager.t('core.err_import_failed', '') : "Import Failed: ") + e.message); 
            return false;
        } finally { 
            SystemUI.hideSyncOverlay(true); 
            if (this._isMounting && this._resumeAllDaemons) this._resumeAllDaemons(); 
        }
    }
};

window.SystemAPI = {
    async initPluginFS(pluginId) { 
        if (!VFS_State.L0[pluginId]) await SystemVFS.mountPluginFS(pluginId);
        return true; 
    }, 
    getFileList(pluginId) { return VFS_State.L0[pluginId]?.filelist || {}; },
    async createFile(pluginId, name, parentid = null, initialContent = "") { return await SystemVFS.createNode(pluginId, name, 'text', parentid, initialContent); },
    async createDirectory(pluginId, name, parentid = null) { return await SystemVFS.createNode(pluginId, name, 'directory', parentid, ""); },
    async readFile(pluginId, fileId) { return await SystemVFS.readFile(pluginId, fileId); },
    async writeFile(pluginId, fileId, content) { return await SystemVFS.writeFile(pluginId, fileId, content); },
    renameNode(pluginId, nodeId, newName) { return SystemVFS.renameNode(pluginId, nodeId, newName); },
    moveNode(pluginId, nodeId, newParentId) { return SystemVFS.moveNode(pluginId, nodeId, newParentId); },
    deleteNode(pluginId, nodeId) { return SystemVFS.deleteNode(pluginId, nodeId); },
    async exportNode(pluginId, nodeId = null) { return await SystemVFS.exportNode(pluginId, nodeId); },
    async importNode(pluginId, targetParentId = null, type = 'file') { return await SystemVFS.importNode(pluginId, targetParentId, type); },
    
    getCloudDirtyList(pluginId) {
        const L0 = VFS_State.L0[pluginId];
        const L1 = VFS_State.L1[pluginId];
        if (!L0 || !L1) return [];

        return Object.keys(L0.filelist).filter(fid => {
            const n0 = L0.filelist[fid];
            const n1 = L1.filelist[fid];
            if (!n0) return false;

            if (n0.is_dirty_meta || n0.sync_version === 0) return true;
            if (n1 && n0.sha256 !== n1.sha256) return true;
            if (L1.unsynced[fid] !== undefined) return true;

            return false;
        });
    },
    
    async syncCloud(pluginId, isAuto = false) { return await SystemVFS.syncCloud(pluginId, isAuto); }
};

const SystemUI = {
    toastTimer: null, confirmCallback: null, _syncOverlayCount: 0,
    showBootScreen() {
        let el = document.getElementById('sys-boot-screen');
        if (!el) {
            el = document.createElement('div'); el.id = 'sys-boot-screen';
            el.innerHTML = `
                <style>#sys-boot-screen { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--sys-bg); z-index: 30000; display: flex; flex-direction: column; justify-content: center; align-items: center; transition: opacity 0.5s ease; } .boot-logo { font-size: 3.5rem; margin-bottom: 24px; color: var(--sys-primary); text-shadow: 0 0 20px rgba(var(--sys-primary-rgb), 0.5); } .boot-bar-bg { width: 320px; height: 6px; background: rgba(128,128,128,0.2); border-radius: 4px; overflow: hidden; margin-bottom: 16px; position: relative; } .boot-bar-fill { width: 0%; height: 100%; background: var(--sys-primary); transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 10px var(--sys-primary); } .boot-text { color: var(--sys-text-muted); font-size: 0.9rem; font-family: monospace; letter-spacing: 0.5px; }</style>
                <div class="boot-logo material-symbols-rounded">security</div>
                <div style="font-size: 1.8rem; color: var(--sys-text); margin-bottom: 35px; font-weight: 700; letter-spacing: 2px;" data-i18n="core.sys_init">System Initializing...</div>
                <div class="boot-bar-bg"><div class="boot-bar-fill" id="boot-progress-fill"></div></div>
                <div class="boot-text" id="boot-progress-text"></div>
            `;
            document.body.appendChild(el);
            if (window.I18nManager) I18nManager.translateDOM(el);
        }
        el.style.opacity = '1'; el.style.display = 'flex'; document.getElementById('boot-progress-fill').style.width = '0%';
    },
    updateBootProgress(percent, msg) { const fill = document.getElementById('boot-progress-fill'); const text = document.getElementById('boot-progress-text'); if (fill) fill.style.width = percent + '%'; if (text) text.innerText = msg; },
    hideBootScreen() { const el = document.getElementById('sys-boot-screen'); if (el) { el.style.opacity = '0'; setTimeout(() => el.style.display = 'none', 500); } },
    showSyncOverlay(msg) {
        this._syncOverlayCount++; let el = document.getElementById('sys-sync-overlay');
        if (!el) {
            el = document.createElement('div'); el.id = 'sys-sync-overlay';
            el.innerHTML = `<style>#sys-sync-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 20000; display: flex; flex-direction: column; justify-content: center; align-items: center; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); transition: opacity 0.3s; } .sys-spinner { width: 50px; height: 50px; border: 4px solid rgba(255,255,255,0.1); border-top-color: var(--sys-primary); border-radius: 50%; animation: sys-spin 1s linear infinite; } @keyframes sys-spin { to { transform: rotate(360deg); } } #sys-sync-msg { margin-top: 24px; color: rgba(255, 255, 255, 0.95); font-size: 1.1rem; font-weight: 500; letter-spacing: 0.5px; text-align: center; padding: 0 24px; line-height: 1.6; }</style><div class="sys-spinner"></div><div id="sys-sync-msg"></div>`;
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

    showLocalBindDialog(type, onBind, onDisable) {
        let el = document.getElementById('sys-local-bind-modal');
        if (!el) { 
            el = document.createElement('div'); el.id = 'sys-local-bind-modal'; el.className = 'sys-modal-overlay'; el.style.zIndex = '10006'; document.body.appendChild(el); 
        }
        
        const isMissing = type === 'MISSING';
        const title = window.I18nManager ? I18nManager.t('core.local_bind_title') : 'Local Bind';
        const desc = isMissing ? (window.I18nManager ? I18nManager.t('core.local_bind_desc_missing') : 'Missing') : (window.I18nManager ? I18nManager.t('core.local_bind_desc_expired') : 'Expired');
        const btnIcon = isMissing ? 'create_new_folder' : 'lock_open_right';
        const btnBindText = window.I18nManager ? I18nManager.t('core.btn_bind_now') : 'Bind Now';
        const btnDisableText = window.I18nManager ? I18nManager.t('core.btn_disable_local') : 'Disable';
        
        window._sysLocalBindCb = (choice) => { 
            el.style.display = 'none'; 
            if (choice === 'bind' && onBind) onBind(); 
            if (choice === 'disable' && onDisable) onDisable(); 
        };

        el.innerHTML = `
            <div class="sys-modal" style="max-width: 480px; padding: 30px;">
                <h3 style="margin-bottom: 16px; font-size: 1.25rem; color: var(--sys-primary); display: flex; align-items: center; gap: 8px;"><span class="material-symbols-rounded">folder_managed</span><span>${title}</span></h3>
                <div style="color: var(--sys-text); font-size: 0.95rem; line-height: 1.6; margin-bottom: 24px; white-space: pre-wrap;">${desc}</div>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <button class="sys-btn primary" style="width: 100%; justify-content: center; padding: 12px;" onclick="window._sysLocalBindCb('bind')"><span class="material-symbols-rounded" style="font-size: 1.2rem; margin-right: 6px;">${btnIcon}</span>${btnBindText}</button>
                    <button class="sys-btn ghost" style="width: 100%; justify-content: center; color: var(--sys-text-muted);" onclick="window._sysLocalBindCb('disable')">${btnDisableText}</button>
                </div>
            </div>`;
        el.style.display = 'flex';
    },

    showConflictDialog(pluginId, fileId, localMeta, cloudMeta, localContent, cloudContent, source, callback) {
        let el = document.getElementById('sys-conflict-modal');
        if (!el) { el = document.createElement('div'); el.id = 'sys-conflict-modal'; el.className = 'sys-modal-overlay'; el.style.zIndex = '20005'; document.body.appendChild(el); }
        window._sysConflictCb = (choice) => { 
            let finalContent = null; if (choice === 'merge' && window._sysDiffEditor) finalContent = window._sysDiffEditor.getModifiedEditor().getValue();
            if (window._sysDiffEditor) { window._sysDiffEditor.dispose(); window._sysDiffEditor = null; }
            el.style.display = 'none'; if (callback) callback(choice, finalContent); 
        };
        const formatTime = (ts) => ts ? new Date(ts).toLocaleString() : 'Unknown';
        
        const conflictTitle = window.I18nManager ? I18nManager.t('core.conflict_title') : 'Conflict';
        const loadingText = window.I18nManager ? I18nManager.t('core.diff_loading') || 'Loading...' : 'Loading...';
        const btnLater = window.I18nManager ? I18nManager.t('core.btn_later') || 'Later' : 'Later';
        const btnCloud = window.I18nManager ? I18nManager.t('core.diff_btn_cloud') || 'Use Cloud' : 'Use Cloud';
        const btnMerge = window.I18nManager ? I18nManager.t('core.diff_btn_merge') || 'Use Local/Merged' : 'Use Local/Merged';

        el.innerHTML = `
            <div class="sys-modal" style="width: 95%; max-width: 1400px; height: 90vh; padding: 20px; display: flex; flex-direction: column;">
                <h3 style="margin-bottom: 12px; font-size: 1.25rem; color: var(--sys-danger); display: flex; align-items: center; gap: 8px; flex-shrink: 0;"><span class="material-symbols-rounded">rule_folder</span><span>${conflictTitle} - ${localMeta.name}</span></h3>
                <div style="color: var(--sys-text-muted); font-size: 0.95rem; margin-bottom: 16px; flex-shrink: 0; display: flex; justify-content: space-between;"><span><b>左侧 (只读)</b>：云端代码 (v${cloudMeta.sync_version || 0})，同步于 ${formatTime(cloudMeta.updated_at)}</span><span><b>右侧 (可编辑)</b>：本地代码 (v${localMeta.sync_version || 0})，修改于 ${formatTime(localMeta.updated_at)}</span></div>
                <div id="sys-diff-container" style="flex: 1; border: 1px solid var(--sys-border); border-radius: 8px; overflow: hidden; margin-bottom: 20px; min-height: 0;"><div style="display:flex; justify-content:center; align-items:center; height:100%; color: var(--sys-text-muted);">${loadingText}</div></div>
                <div class="modal-actions" style="margin-top: 0; flex-shrink: 0; justify-content: space-between;"><button class="sys-btn ghost" onclick="window._sysConflictCb('cancel')">${btnLater}</button><div style="display: flex; gap: 12px;"><button class="sys-btn" style="background: var(--sys-surface-hover); color: var(--sys-text);" onclick="window._sysConflictCb('cloud')">${btnCloud}</button><button class="sys-btn primary" onclick="window._sysConflictCb('merge')">${btnMerge}</button></div></div>
            </div>`;
        el.style.display = 'flex';
        SystemCore.loadMonaco().then(() => {
            const container = document.getElementById('sys-diff-container'); container.innerHTML = ''; 
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark'; const ext = localMeta.name.split('.').pop().toLowerCase();
            const map = { 'js': 'javascript', 'json': 'json', 'md': 'markdown', 'html': 'html', 'css': 'css', 'cpp': 'cpp', 'c': 'c', 'py': 'python', 'java': 'java', 'ts': 'typescript', 'txt': 'plaintext' };
            const diffEditor = monaco.editor.createDiffEditor(container, { theme: isDark ? 'vs-dark' : 'vs', automaticLayout: true, originalEditable: false, readOnly: false, renderSideBySide: true, ignoreTrimWhitespace: false, fontSize: 14, fontFamily: "'Consolas', 'Courier New', monospace" });
            const originalModel = monaco.editor.createModel(cloudContent || "", map[ext] || 'plaintext'); const modifiedModel = monaco.editor.createModel(localContent || "", map[ext] || 'plaintext');
            diffEditor.setModel({ original: originalModel, modified: modifiedModel }); window._sysDiffEditor = diffEditor;
        }).catch(e => { 
            const loadFailText = window.I18nManager ? I18nManager.t('core.engine_load_failed') || 'Engine load failed' : 'Engine load failed';
            document.getElementById('sys-diff-container').innerHTML = `<div style="padding:20px; color:var(--sys-danger);">${loadFailText}: ${e.message}</div>`; 
        });
    },
    showRollbackDialog(pluginId, fid, type, vLoc, vRem, callback) {
        let el = document.getElementById('sys-rollback-modal');
        if (!el) { el = document.createElement('div'); el.id = 'sys-rollback-modal'; el.className = 'sys-modal-overlay'; el.style.zIndex = '10006'; document.body.appendChild(el); }
        window._sysRollbackCb = (choice) => { el.style.display = 'none'; if (callback) callback(choice); };
        const locMeta = VFS_State.L1[pluginId].filelist[fid]; const isDirty = type === 'dirty';
        
        if (!window.I18nManager) return;

        let title = isDirty ? I18nManager.t('core.rollback_title_dirty') : I18nManager.t('core.rollback_title_clean');
        let desc = isDirty ? I18nManager.t('core.rollback_desc_dirty', locMeta.name, vRem, vLoc) : I18nManager.t('core.rollback_desc_clean', locMeta.name, vRem, vLoc);
        
        el.innerHTML = `
            <div class="sys-modal" style="max-width: 500px; padding: 30px;">
                <h3 style="margin-bottom: 16px; font-size: 1.25rem; color: #ff5252; display: flex; align-items: center; gap: 8px;"><span class="material-symbols-rounded">history_toggle_off</span><span>${title}</span></h3>
                <div style="color: var(--sys-text); font-size: 0.95rem; line-height: 1.6; margin-bottom: 24px;">${desc}<br><br>
                    <div style="background: var(--sys-surface-hover); padding: 16px; border-radius: 12px; margin-bottom: 12px; cursor: pointer; border: 2px solid #ff5252;" onclick="window._sysRollbackCb('force_push')"><div style="font-weight: 600; font-size: 1.05rem; color: #ff5252; margin-bottom: 4px;">${isDirty ? I18nManager.t('core.rollback_btn_force_dirty') : I18nManager.t('core.rollback_btn_force_clean')}</div><div style="font-size: 0.85rem; color: var(--sys-text-muted);">${I18nManager.t('core.rollback_btn_force_desc')}</div></div>
                    <div style="background: var(--sys-surface-hover); padding: 16px; border-radius: 12px; cursor: pointer; border: 2px solid transparent;" onmouseover="this.style.borderColor='var(--sys-primary)'" onmouseout="this.style.borderColor='transparent'" onclick="window._sysRollbackCb('accept_rollback')"><div style="font-weight: 600; font-size: 1.05rem; color: var(--sys-primary); margin-bottom: 4px;">${I18nManager.t('core.rollback_btn_accept')}</div><div style="font-size: 0.85rem; color: var(--sys-text-muted);">${isDirty ? I18nManager.t('core.rollback_warn_dirty') : I18nManager.t('core.rollback_warn_clean')}</div></div>
                </div>
                <div class="modal-actions" style="margin-top: 0; justify-content: flex-end;"><button class="sys-btn ghost" onclick="document.getElementById('sys-rollback-modal').style.display='none';">${I18nManager.t('core.btn_later')}</button></div>
            </div>`;
        el.style.display = 'flex';
    },
    showError(msg) {
        let el = document.getElementById('sys-error-modal');
        if (!el) {
            el = document.createElement('div'); el.id = 'sys-error-modal'; el.className = 'sys-modal-overlay'; el.style.zIndex = '10005'; 
            el.innerHTML = `
                <div class="sys-modal" style="max-width: 680px; padding: 30px;">
                    <h3 style="margin-bottom: 16px; font-size: 1.25rem; color: var(--sys-danger); display: flex; align-items: center; gap: 8px;"><span class="material-symbols-rounded">error</span><span id="sys-err-title">${window.I18nManager ? I18nManager.t('core.error_title') || 'Error' : 'Error'}</span></h3>
                    <div id="sys-error-msg" style="color: #d4d4d4; font-family: Consolas, monospace; font-size: 0.9rem; line-height: 1.5; margin-bottom: 24px; word-break: break-all; white-space: pre-wrap; max-height: 50vh; overflow-y: auto; background: #1e1e1e; padding: 16px; border-radius: 8px; border: 1px solid #333; user-select: text;"></div>
                    <div class="modal-actions" style="margin-top: 0; display: flex; align-items: center; width: 100%;"><button class="sys-btn ghost" onclick="navigator.clipboard.writeText(document.getElementById('sys-error-msg').innerText).then(() => SystemUI.showToast(window.I18nManager ? I18nManager.t('core.msg_copied') || 'Copied' : 'Copied'))" style="width: auto; padding: 10px 16px; margin-right: auto; color: var(--sys-text-muted);"><span class="material-symbols-rounded" style="font-size: 1.1rem; margin-right: 4px;">content_copy</span><span id="sys-err-btn-copy">${window.I18nManager ? I18nManager.t('core.btn_copy_err') || 'Copy' : 'Copy'}</span></button><button class="sys-btn primary" onclick="document.getElementById('sys-error-modal').style.display='none'" style="width: auto; padding: 10px 24px; background: var(--sys-danger); color: var(--sys-on-danger);" id="sys-err-btn-ok">${window.I18nManager ? I18nManager.t('core.btn_i_know') || 'OK' : 'OK'}</button></div>
                </div>`;
            document.body.appendChild(el);
        } else {
            if (window.I18nManager) {
                document.getElementById('sys-err-title').innerText = I18nManager.t('core.error_title') || 'Error'; 
                document.getElementById('sys-err-btn-copy').innerText = I18nManager.t('core.btn_copy_err') || 'Copy'; 
                document.getElementById('sys-err-btn-ok').innerText = I18nManager.t('core.btn_i_know') || 'OK';
            }
        }
        document.getElementById('sys-error-msg').innerText = msg; el.style.display = 'flex';
    },
    initTheme() {
        const savedTheme = localStorage.getItem('sys_theme'); const isDark = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
        const iconEl = document.getElementById('icon-theme-toggle');
        if (isDark) { document.documentElement.setAttribute('data-theme', 'dark'); if(iconEl) iconEl.innerText = 'light_mode'; } 
        else { document.documentElement.setAttribute('data-theme', 'light'); if(iconEl) iconEl.innerText = 'dark_mode'; }
        if (window.monaco) monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs');
    },
    toggleTheme() {
        const html = document.documentElement; const newTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; const iconEl = document.getElementById('icon-theme-toggle');
        html.setAttribute('data-theme', newTheme); localStorage.setItem('sys_theme', newTheme);
        if(iconEl) iconEl.innerText = newTheme === 'dark' ? 'light_mode' : 'dark_mode';
        if (window.monaco) monaco.editor.setTheme(newTheme === 'dark' ? 'vs-dark' : 'vs');
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
        const bindBtn = document.getElementById('sys-btn-bind'); 
        if (window.I18nManager) {
            bindBtn.setAttribute('data-i18n', type === 'local' ? 'core.btn_mount_local' : 'core.btn_mount'); 
            I18nManager.translateDOM(bindBtn.parentElement);
        }
    },
    toggleSettingsFields() {
        document.getElementById('set-local-fields').style.display = document.getElementById('set-chk-local').checked ? 'block' : 'none';
        document.getElementById('set-github-fields').style.display = document.getElementById('set-chk-github').checked ? 'block' : 'none';
        document.getElementById('set-api-fields').style.display = document.getElementById('set-chk-api').checked ? 'block' : 'none';
    },
    setMode(mode) {
        ['lock-setup-area', 'lock-input-area'].forEach(id => document.getElementById(id).style.display = 'none');
        const titleEl = document.getElementById('lock-title'); const descEl = document.getElementById('lock-desc'); const unlockBtn = document.getElementById('sys-btn-unlock');
        if (mode === 'BIND_NEW') { titleEl.setAttribute('data-i18n', 'core.sys_init'); descEl.setAttribute('data-i18n', 'core.sys_uninitialized'); document.getElementById('lock-setup-area').style.display = 'block'; this.toggleSetupFields(); } 
        else if (mode === 'CREATE_PWD' || mode === 'UNLOCK') { 
            titleEl.setAttribute('data-i18n', mode === 'CREATE_PWD' ? 'core.sys_create_pwd' : 'core.sys_locked'); 
            descEl.setAttribute('data-i18n', mode === 'CREATE_PWD' ? 'core.sys_create_pwd_desc' : 'core.sys_locked_desc'); 
            unlockBtn.setAttribute('data-i18n', mode === 'CREATE_PWD' ? 'core.btn_create' : 'core.btn_unlock'); 
            document.getElementById('lock-input-area').style.display = 'block'; 
            if (mode === 'CREATE_PWD') { document.getElementById('sys-pwd2').style.display = 'block'; document.getElementById('sys-pwd-tip').style.display = 'block'; } 
            else { document.getElementById('sys-pwd2').style.display = 'none'; document.getElementById('sys-pwd-tip').style.display = 'none'; }
        }
        if (window.I18nManager) I18nManager.translateDOM(); 
    },
    
    async openSettings() {
        if (!window.I18nManager) return;
        document.getElementById('sys-lang-select').value = I18nManager.currentLang;
        const st = SystemCore.config.storage || {}; const bType = SystemCore.bootConfig?.type;
        const chkLocal = document.getElementById('set-chk-local'); const chkGh = document.getElementById('set-chk-github'); const chkApi = document.getElementById('set-chk-api');
        
        document.getElementById('sys-auto-lock-select').value = SystemCore.config.auto_lock || 0;
        
        const isOptOut = localStorage.getItem('sys_local_opt_out') === 'true';
        
        chkLocal.checked = (!!st.local && !isOptOut) || bType === 'local'; 
        chkLocal.disabled = (bType === 'local');
        
        const dirNameEl = document.getElementById('set-local-dir-name'); 
        dirNameEl.innerText = "...";
        
        try { 
            let handleName = ''; 
            let hasPerm = false;
            
            if (bType === 'local' && SystemCore.bootConfig.handle) {
                handleName = SystemCore.bootConfig.handle.name;
                hasPerm = true;
            } else if (chkLocal.checked) { 
                const handle = await CoreDB.get('sys_dir_handle'); 
                if (handle) {
                    handleName = handle.name;
                    try { hasPerm = (await handle.queryPermission({mode: 'readwrite'})) === 'granted'; } catch(e){}
                }
            }
            
            if (handleName) {
                if (hasPerm) {
                    dirNameEl.innerText = `${I18nManager.t('core.current_dir')}: ${handleName}`;
                } else {
                    dirNameEl.innerHTML = `${I18nManager.t('core.current_dir')}: ${handleName} <span style="color:var(--sys-danger); font-size:0.85rem; margin-left:8px; font-weight:bold;">(⚠️ 权限已过期)</span>`;
                }
            } else {
                dirNameEl.innerText = I18nManager.t('core.no_dir_bound');
            }
        } catch(e) { 
            dirNameEl.innerText = I18nManager.t('core.no_dir_bound'); 
        }
        
        chkGh.checked = !!st.github || bType === 'github'; chkGh.disabled = (bType === 'github'); document.getElementById('set-gh-token').value = st.github?.token || (bType === 'github' ? SystemCore.bootConfig.token : ''); document.getElementById('set-gh-repo').value = st.github?.repo || (bType === 'github' ? SystemCore.bootConfig.repo : '');
        chkApi.checked = !!st.api || bType === 'api'; document.getElementById('set-api-url').value = st.api?.url || (bType === 'api' ? SystemCore.bootConfig.url : ''); document.getElementById('set-api-token').value = st.api?.token || (bType === 'api' ? SystemCore.bootConfig.token : '');
        
        this.toggleSettingsFields(); document.getElementById('sys-settings-modal').style.display = 'flex';
    }
};

const SystemCore = {
    config: {}, _sysState: 'UNKNOWN', _currentPlugin: null, _loadedPlugins: {}, bootConfig: null,
    _autoLockTimer: null, _lastActivity: Date.now(), _autoLockListeners: null, _lastPwd: null,
    
    async loadMonaco() {
        if (window.monaco) return;
        return new Promise((resolve, reject) => {
            if (document.getElementById('sys-monaco-loader')) { const check = setInterval(() => { if (window.monaco) { clearInterval(check); resolve(); } }, 50); return; }
            window.MonacoEnvironment = { getWorkerUrl: function(workerId, label) { return `data:text/javascript;charset=utf-8,${encodeURIComponent(`self.MonacoEnvironment = { baseUrl: '${window.location.origin}/libs/monaco-editor/min/' }; importScripts('${window.location.origin}/libs/monaco-editor/min/vs/base/worker/workerMain.js');`)}`; } };
            const script = document.createElement('script'); script.id = 'sys-monaco-loader'; script.src = 'libs/monaco-editor/min/vs/loader.js';
            script.onload = () => { require.config({ paths: { 'vs': 'libs/monaco-editor/min/vs' } }); require(['vs/editor/editor.main'], () => { if (window.define && window.define.amd) delete window.define.amd; resolve(); }); };
            script.onerror = () => reject(new Error(window.I18nManager ? I18nManager.t('core.err_no_monaco') : 'Failed to load Monaco')); document.head.appendChild(script);
        });
    },

    async loadVditor() {
        if (window.Vditor) return;
        return new Promise((resolve, reject) => {
            if (document.getElementById('sys-vditor-loader')) { const check = setInterval(() => { if (window.Vditor) { clearInterval(check); resolve(); } }, 50); return; }
            const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'libs/vditor/dist/index.css'; document.head.appendChild(link);
            const script = document.createElement('script'); script.id = 'sys-vditor-loader'; script.src = 'libs/vditor/dist/index.min.js';
            script.onload = () => { const checkReady = setInterval(() => { if (window.Vditor) { clearInterval(checkReady); resolve(); } }, 20); setTimeout(() => { clearInterval(checkReady); if (!window.Vditor) reject(new Error(window.I18nManager ? I18nManager.t('core.err_vditor_timeout') : 'Vditor timeout')); }, 5000); };
            script.onerror = () => reject(new Error(window.I18nManager ? I18nManager.t('core.err_vditor_failed') : 'Vditor failed')); document.body.appendChild(script);
        });
    },

    async loadExcelLibs() {
        if (window.LuckyExcel && window.ExcelJS) return;
        return new Promise(async (resolve, reject) => {
            try {
                await this._loadScript('libs/scripts/luckyexcel.umd.js');
                await this._loadScript('libs/scripts/exceljs.min.js');
                resolve();
            } catch (e) {
                console.warn("[SystemCore] 无法预加载 ExcelJS 或 LuckyExcel: ", e);
                resolve();
            }
        });
    },

    async _setupDataSources() {
        DataSourceManager.clear();
        this._needLocalReauth = null; 
        
        const st = this.config.storage || {}; const boot = this.bootConfig || {};
        const isOptOut = localStorage.getItem('sys_local_opt_out') === 'true'; 
        
        if (st.local === true || boot.type === 'local') {
            let handle = boot.type === 'local' ? boot.handle : null;
            if(!handle) handle = await CoreDB.get('sys_dir_handle'); 
            
            if(handle) {
                try {
                    const perm = await handle.queryPermission({mode: 'readwrite'});
                    if (perm === 'granted') {
                        DataSourceManager.register(new LocalDataSource('local_main', 'local', { handle }));
                    } else {
                        console.warn("[VFS] 本地目录权限已丢失 (Prompt/Denied)。已降级为仅内存/云端模式。");
                        if (!isOptOut) this._needLocalReauth = { type: 'EXPIRED', handle }; 
                    }
                } catch(e) {
                    console.warn("[VFS] 无法验证本地目录权限:", e);
                    if (!isOptOut) this._needLocalReauth = { type: 'EXPIRED', handle };
                }
            } else if (st.local === true) {
                if (!isOptOut) this._needLocalReauth = { type: 'MISSING' };
            }
        }
        
        if (st.github || boot.type === 'github') {
            const token = st.github?.token || boot.token; const repo = st.github?.repo || boot.repo;
            DataSourceManager.register(new GithubDataSource('github_main', 'github', { token, repo }));
        }
        if (st.api || boot.type === 'api') {
            const url = st.api?.url || boot.url; const token = st.api?.token || boot.token;
            DataSourceManager.register(new ApiDataSource('api_main', 'api', { url, token }));
        }
    },

    async boot() {
        SystemUI.initTheme();
        if (window.I18nManager) I18nManager.translateDOM(); 
        try { 
            const savedEncConfig = localStorage.getItem('sys_boot_config_enc'); 
            if (!savedEncConfig) return SystemUI.setMode('BIND_NEW'); 
            this._sysState = 'UNLOCK_LOCAL'; SystemUI.setMode('UNLOCK'); 
        } catch (e) { SystemUI.setMode('BIND_NEW'); }
    },
    
    async handleBindStorage() {
        if (!window.I18nManager) return;
        const type = document.getElementById('setup-storage-type').value; let config = { type };
        try {
            if (type === 'local') { if (!window.showDirectoryPicker) return SystemUI.showToast(I18nManager.t('core.err_no_fs_api')); const handle = await window.showDirectoryPicker({mode: 'readwrite'}); await CoreDB.set('sys_dir_handle', handle); config.handle = handle; } 
            else if (type === 'github') { config.token = document.getElementById('setup-gh-token').value.trim(); config.repo = document.getElementById('setup-gh-repo').value.trim(); if (!config.token || !config.repo) return SystemUI.showToast(I18nManager.t('core.err_gh_incomplete')); } 
            else if (type === 'api') { config.url = document.getElementById('setup-api-url').value.trim(); config.token = document.getElementById('setup-api-token').value.trim(); if (!config.url) return SystemUI.showToast(I18nManager.t('core.err_api_incomplete')); }
            this.bootConfig = config; await this.checkSystemFiles();
        } catch (e) { if (e.name !== 'AbortError') SystemUI.showToast(I18nManager.t('core.mount_failed', e.message || e.name)); }
    },
    
    async checkSystemFiles() {
        SystemUI.showSyncOverlay(window.I18nManager ? I18nManager.t('core.detecting_storage') : 'Detecting Storage...');
        try { 
            const bootSource = DataSourceManager.createSource('boot', this.bootConfig);
            const content = await bootSource.readPhysicalFile('boot_config');
            const configExists = content !== null;
            if (configExists && content.byteLength < 32) throw new Error("Legacy repo detected.");
            this._sysState = configExists ? 'UNLOCK_REMOTE_FIRST_TIME' : 'CREATE'; 
            SystemUI.setMode(configExists ? 'UNLOCK' : 'CREATE_PWD'); SystemUI.hideSyncOverlay(true); 
        } 
        catch(e) { 
            SystemUI.hideSyncOverlay(true);
            if (!window.I18nManager) return;
            if (e.message === 'NETWORK_OFFLINE' || e.message.startsWith('SERVER_ERROR')) { SystemUI.showError(I18nManager.t('core.connect_failed_detail', 'Network Offline')); } 
            else if (e.message === 'AUTH_FAILED') { SystemUI.showError(I18nManager.t('core.auth_failed')); } 
            else { SystemUI.showToast(I18nManager.t('core.connect_failed_detail', e.message || e.name)); }
            SystemUI.setMode('BIND_NEW'); 
        }
    },

    async bindLocalInSettings() {
        if (!window.I18nManager) return;
        if (!window.showDirectoryPicker) return SystemUI.showToast(I18nManager.t('core.err_no_fs_api'));
        try {
            const handle = await window.showDirectoryPicker({mode: 'readwrite'});
            
            SystemVFS._pauseAllDaemons();
            SystemUI.showSyncOverlay(I18nManager.t('core.sync_detect_lineage'));
            
            const tempSource = new LocalDataSource('temp', 'local', { handle });
            let probeBuf = null;
            try { probeBuf = await tempSource.readPhysicalFile('boot_config'); } catch(e) {}
            
            if (!probeBuf) {
                SystemUI.hideSyncOverlay();
                SystemUI.showConfirm(I18nManager.t('core.sync_format_confirm'), async () => {
                    try {
                        SystemUI.showSyncOverlay(I18nManager.t('core.sync_formatting'));
                        for await (const entry of handle.values()) {
                            await handle.removeEntry(entry.name, { recursive: entry.kind === 'directory' });
                        }
                        await CoreDB.set('sys_dir_handle', handle);
                        document.getElementById('set-local-dir-name').innerText = `${I18nManager.t('core.current_dir')}: ${handle.name}`;
                        DataSourceManager.register(new LocalDataSource('local_main', 'local', { handle }));
                        
                        for (let pid in VFS_State.L0) {
                            VFS_State.LLocal[pid] = { filelist: {}, sync_time: 0, next_tick: Date.now() };
                        }
                        SystemVFS._resumeAllDaemons();
                        SystemUI.hideSyncOverlay(true);
                        SystemUI.showToast(I18nManager.t('core.sync_mount_success'));
                    } catch (err) {
                        SystemUI.hideSyncOverlay(true); SystemVFS._resumeAllDaemons();
                        SystemUI.showError(I18nManager.t('core.sync_format_failed', err.message));
                    }
                });
            } else {
                try {
                    const pwd = this._lastPwd;
                    if (!pwd) throw new Error(I18nManager.t('core.err_pwd_released'));
                    
                    const saltBuf = probeBuf.slice(0, 32); const encConfigUint8 = probeBuf.slice(32);
                    const probeSaltHex = CoreUtils.bufToHex(saltBuf);
                    
                    let remoteConfigStr;
                    if (probeSaltHex === this.bootConfig.salt) {
                        remoteConfigStr = await CoreCrypto.decrypt(encConfigUint8);
                    } else {
                        remoteConfigStr = await CoreCrypto.tempDecrypt(encConfigUint8, pwd, probeSaltHex);
                    }
                    const remoteConfig = JSON.parse(remoteConfigStr);
                    
                    const remoteUid = remoteConfig.uid;
                    const localUid = this.config.uid;
                    
                    if (remoteUid && localUid && remoteUid !== localUid) {
                        SystemUI.hideSyncOverlay(); SystemVFS._resumeAllDaemons();
                        return SystemUI.showError(I18nManager.t('core.err_uid_mismatch'));
                    }
                    
                    await CoreDB.set('sys_dir_handle', handle);
                    document.getElementById('set-local-dir-name').innerText = `${I18nManager.t('core.current_dir')}: ${handle.name}`;
                    DataSourceManager.register(new LocalDataSource('local_main', 'local', { handle }));
                    
                    const localSource = DataSourceManager.get('local_main');
                    for (let pid in VFS_State.L0) {
                        try {
                            const listBuf = await localSource.pullRawFilelist(pid);
                            if (listBuf) {
                                const oldList = JSON.parse(await CoreCrypto.decrypt(listBuf));
                                SystemVFS._migrateLegacyData(oldList);
                                VFS_State.LLocal[pid].filelist = oldList;
                            } else { VFS_State.LLocal[pid].filelist = {}; }
                        } catch(e) { VFS_State.LLocal[pid].filelist = {}; }
                        
                        VFS_State.LLocal[pid].sync_time = 0;
                        VFS_State.LLocal[pid].next_tick = Date.now();
                    }
                    
                    SystemVFS._resumeAllDaemons();
                    SystemUI.hideSyncOverlay();
                    SystemUI.showToast(I18nManager.t('core.sync_mount_history_success'));
                } catch(e) {
                    SystemUI.hideSyncOverlay(); SystemVFS._resumeAllDaemons();
                    SystemUI.showError(I18nManager.t('core.err_mount_failed_detail', e.message || I18nManager.t('core.data_corrupted')));
                }
            }
        } catch (e) {
            SystemUI.hideSyncOverlay(true); SystemVFS._resumeAllDaemons();
            if (e.name !== 'AbortError') SystemUI.showToast(I18nManager.t('core.err_mount_canceled', e.message || e.name));
        }
    },

    async saveEncryptedBootConfig() { 
        const configToSave = { ...this.bootConfig }; delete configToSave.handle; 
        const encBootUint8 = await CoreCrypto.encrypt(JSON.stringify(configToSave)); 
        const saltBuf = new Uint8Array(CoreUtils.hexToBuf(this.bootConfig.salt));
        const finalBuf = new Uint8Array(saltBuf.byteLength + encBootUint8.byteLength);
        finalBuf.set(saltBuf, 0); finalBuf.set(encBootUint8, saltBuf.byteLength);
        localStorage.setItem('sys_boot_config_enc', await CoreUtils.bufToBase64(finalBuf)); 
    },

    async saveSysConfig() {
        SystemUI.showSyncOverlay(window.I18nManager ? I18nManager.t('core.sync_saving_core') : "Saving Core...");
        try {
            const encryptedUint8 = await CoreCrypto.encrypt(JSON.stringify(this.config));
            const saltBuf = new Uint8Array(CoreUtils.hexToBuf(this.bootConfig.salt));
            const finalBuf = new Uint8Array(saltBuf.byteLength + encryptedUint8.byteLength);
            finalBuf.set(saltBuf, 0); finalBuf.set(encryptedUint8, saltBuf.byteLength);

            const bootSource = DataSourceManager.createSource('boot', this.bootConfig);
            const syncTasks = [bootSource.writeRawFile('boot_config', finalBuf)];
            
            const st = this.config.storage || {};
            if (st.github && this.bootConfig.type !== 'github') syncTasks.push(DataSourceManager.createSource('gh_sys', {type: 'github', ...st.github}).writeRawFile('boot_config', finalBuf));
            if (st.api && this.bootConfig.type !== 'api') syncTasks.push(DataSourceManager.createSource('api_sys', {type: 'api', ...st.api}).writeRawFile('boot_config', finalBuf));
            
            if (st.local === true && this.bootConfig.type !== 'local') {
                const localH = await CoreDB.get('sys_dir_handle');
                if (localH) syncTasks.push(DataSourceManager.createSource('local_sys', {type: 'local', handle: localH}).writeRawFile('boot_config', finalBuf));
            }
            await Promise.all(syncTasks);
        } finally { SystemUI.hideSyncOverlay(); }
    },

    startAutoLock() {
        this.stopAutoLock();
        const timeoutMinutes = this.config?.auto_lock || 0;
        if (timeoutMinutes <= 0) return;
        const ms = timeoutMinutes * 60 * 1000;
        this._lastActivity = Date.now();
        this._autoLockTimer = setInterval(() => { if (Date.now() - this._lastActivity >= ms && this._sysState !== 'UNKNOWN' && document.getElementById('sys-desktop').style.display === 'flex') { this.lock(); } }, 10000);
        const resetFn = () => { this._lastActivity = Date.now(); };
        window.addEventListener('mousemove', resetFn); window.addEventListener('keydown', resetFn);
        window.addEventListener('touchstart', resetFn); window.addEventListener('click', resetFn);
        this._autoLockListeners = resetFn;
    },
    
    stopAutoLock() {
        if (this._autoLockTimer) clearInterval(this._autoLockTimer);
        if (this._autoLockListeners) {
            window.removeEventListener('mousemove', this._autoLockListeners); window.removeEventListener('keydown', this._autoLockListeners);
            window.removeEventListener('touchstart', this._autoLockListeners); window.removeEventListener('click', this._autoLockListeners);
            this._autoLockListeners = null;
        }
    },

    async _finishLogin() { 
        await this._setupDataSources();
        
        document.getElementById('sys-pwd').value = ""; document.getElementById('sys-pwd2').value = ""; 
        
        SystemUI.showBootScreen();
        SystemUI.updateBootProgress(20, window.I18nManager ? I18nManager.t('core.boot_warming_editor') : 'Warming up editors...');
        
        try {
            await this.loadVditor();
            await this.loadExcelLibs();
            await this.loadMonaco();

            SystemUI.updateBootProgress(40, window.I18nManager ? I18nManager.t('core.boot_vfs_align') : 'Aligning VFS...');
            await SystemVFS.bootSyncAllPlugins();

            SystemUI.updateBootProgress(80, window.I18nManager ? I18nManager.t('core.boot_preloading_plugins') : 'Preloading plugins...');
            await this.loadPlugins(true); 

            SystemUI.updateBootProgress(100, window.I18nManager ? I18nManager.t('core.boot_ready') : 'Ready');
            setTimeout(() => {
                SystemUI.hideBootScreen();
                SystemUI.switchScreen('sys-desktop');
                this.startAutoLock();
                const firstPlugin = document.querySelector('.dock-item');
                if (firstPlugin) firstPlugin.click(); 
                
                if (this._needLocalReauth) {
                    setTimeout(() => {
                        SystemUI.showLocalBindDialog(
                            this._needLocalReauth.type, 
                            async () => {
                                try {
                                    let finalHandle;
                                    if (this._needLocalReauth.type === 'EXPIRED') {
                                        const perm = await this._needLocalReauth.handle.requestPermission({mode: 'readwrite'});
                                        if (perm === 'granted') finalHandle = this._needLocalReauth.handle;
                                    }
                                    if (!finalHandle) {
                                        finalHandle = await window.showDirectoryPicker({mode: 'readwrite'});
                                    }
                                    
                                    await CoreDB.set('sys_dir_handle', finalHandle);
                                    DataSourceManager.register(new LocalDataSource('local_main', 'local', { handle: finalHandle }));
                                    
                                    localStorage.removeItem('sys_local_opt_out');
                                    
                                    for (let pid in VFS_State.L0) {
                                        if (VFS_State.LLocal[pid]) {
                                            VFS_State.LLocal[pid].sync_time = 0;
                                            VFS_State.LLocal[pid].next_tick = Date.now();
                                        }
                                    }
                                    if (window.I18nManager) SystemUI.showToast(I18nManager.t('core.perm_restored'));
                                } catch (e) {
                                    console.warn("User aborted local binding", e);
                                }
                            }, 
                            async () => {
                                localStorage.setItem('sys_local_opt_out', 'true');
                                await CoreDB.set('sys_dir_handle', null); 
                                if (window.I18nManager) SystemUI.showToast(I18nManager.t('core.btn_disable_local') + " (OK)");
                            }
                        );
                    }, 1000);
                }
            }, 600);
        } catch (e) {
            console.error("Boot sequence failed:", e);
            SystemUI.hideBootScreen();
            if (window.I18nManager) SystemUI.showError(I18nManager.t('core.boot_failed', e.message));
        }
    },

    async handleAuth() {
        if (!window.I18nManager) return;
        const pwd = document.getElementById('sys-pwd').value; if (!pwd) return SystemUI.showToast(I18nManager.t('core.pwd_empty')); SystemUI.showToast(I18nManager.t('core.processing_key'));
        this._lastPwd = pwd; 
        
        try {
            if (this._sysState === 'UNLOCK_LOCAL') {
                const encConfigB64 = localStorage.getItem('sys_boot_config_enc'); 
                if (!encConfigB64) throw new Error("Local config missing");
                const fullBuf = new Uint8Array(CoreUtils.base64ToBuf(encConfigB64));
                if (fullBuf.byteLength < 32) throw new Error("Corrupted local config");

                const saltBuf = fullBuf.slice(0, 32); const encConfigUint8 = fullBuf.slice(32);
                const savedSaltHex = CoreUtils.bufToHex(saltBuf);
                
                await CoreCrypto.initKeys(pwd, savedSaltHex);
                let decConfigStr;
                try { decConfigStr = await CoreCrypto.decrypt(encConfigUint8); } catch(e) { throw new Error("LocalDecryptFailed"); } 
                this.bootConfig = JSON.parse(decConfigStr); this.bootConfig.salt = savedSaltHex; 
                
                if (this.bootConfig.type === 'local') { 
                    const handle = await CoreDB.get('sys_dir_handle'); 
                    if (!handle || await handle.queryPermission({mode: 'readwrite'}) !== 'granted') throw new Error("LocalHandleLost"); 
                    this.bootConfig.handle = handle; 
                }
                
                SystemUI.showBootScreen();
                SystemUI.updateBootProgress(10, I18nManager.t('core.boot_connecting') || 'Connecting...');
                
                const bootSource = DataSourceManager.createSource('boot', this.bootConfig);
                let remoteFullBuf;
                try { 
                    remoteFullBuf = await bootSource.readPhysicalFile('boot_config'); 
                    if (!remoteFullBuf) throw new Error("RemoteFileNotFound"); 
                } catch(e) {
                    if (e.message === 'NETWORK_OFFLINE' || e.message.startsWith('SERVER_ERROR') || e.message === 'RemoteFileNotFound') {
                        console.warn("[VFS] Boot Source Offline. Falling back to local verified config.");
                        if (!this.config) this.config = { storage: {} };
                        this.config.storage[this.bootConfig.type] = this.bootConfig;
                    } else throw e;
                }

                if (remoteFullBuf) {
                    if (remoteFullBuf.byteLength < 32) throw new Error(`DataCorrupted: boot_config too short`);
                    const remoteEncSysUint8 = remoteFullBuf.slice(32);
                    try {
                        this.config = JSON.parse(await CoreCrypto.decrypt(remoteEncSysUint8));
                        
                        let configChanged = false;

                        if (!this.config.uid) {
                            this.config.uid = this.bootConfig.uid || `sys_${Date.now().toString(36)}`;
                            this.bootConfig.uid = this.config.uid;
                            configChanged = true;
                        } else {
                            this.bootConfig.uid = this.config.uid;
                        }
                        
                        if (!this.config.storage) {
                            this.config.storage = {};
                            configChanged = true;
                        }
                        
                        const oldStorageStr = JSON.stringify(this.config.storage);
                        
                        if (this.bootConfig.type === 'local') {
                            this.config.storage.local = true;
                        } else {
                            const bConf = { ...this.bootConfig }; delete bConf.handle;
                            this.config.storage[this.bootConfig.type] = bConf;
                        }
                        
                        const newStorageStr = JSON.stringify(this.config.storage);
                        if (oldStorageStr !== newStorageStr) configChanged = true;
                        
                        if (configChanged) {
                            await this.saveSysConfig(); 
                        }
                    } catch(err) { throw new Error("MELTDOWN"); }
                }
                this._finishLogin();
            } 
            else if (this._sysState === 'CREATE') {
                if (pwd.length < 4) throw new Error(I18nManager.t('core.pwd_short'));
                const pwd2 = document.getElementById('sys-pwd2').value;
                if (pwd !== pwd2) { SystemUI.hideSyncOverlay(true); return SystemUI.showToast(I18nManager.t('core.pwd_mismatch')); }
                
                const generatedSalt = await CoreCrypto.initKeys(pwd, null);
                this.bootConfig.salt = generatedSalt;
                
                this.bootConfig.uid = `sys_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;

                let initStorage = {}; const bConf = this.bootConfig;
                if (bConf.type === 'local') initStorage.local = true; if (bConf.type === 'github') initStorage.github = { token: bConf.token, repo: bConf.repo }; if (bConf.type === 'api') initStorage.api = { url: bConf.url, token: bConf.token };
                this.config = { os_version: '9.8.0', uid: this.bootConfig.uid, created_at: Date.now(), storage: initStorage, file_meta: {}, auto_lock: 0 }; 
                
                await this.saveSysConfig(); await this.saveEncryptedBootConfig(); this._finishLogin();
            } 
            else if (this._sysState === 'UNLOCK_REMOTE_FIRST_TIME') {
                SystemUI.showSyncOverlay(I18nManager.t('core.verifying_remote'));
                try {
                    const bootSource = DataSourceManager.createSource('boot', this.bootConfig);
                    const remoteFullBuf = await bootSource.readPhysicalFile('boot_config');
                    if (!remoteFullBuf) throw new Error("RemoteFileNotFound");
                    if (remoteFullBuf.byteLength < 32) throw new Error(`DataCorrupted: boot_config too short`);
                    
                    const saltBuf = remoteFullBuf.slice(0, 32); const encSysUint8 = remoteFullBuf.slice(32);
                    const magic = new TextDecoder().decode(encSysUint8.slice(0, 4));
                    if (magic !== "SEC2") throw new Error(`DataCorrupted`);

                    const remoteSaltHex = CoreUtils.bufToHex(saltBuf); this.bootConfig.salt = remoteSaltHex;
                    await CoreCrypto.initKeys(pwd, remoteSaltHex);
                    this.config = JSON.parse(await CoreCrypto.decrypt(encSysUint8));
                    
                    let configChanged = false;

                    if (!this.config.uid) {
                        this.config.uid = this.bootConfig.uid || `sys_${Date.now().toString(36)}`;
                        this.bootConfig.uid = this.config.uid;
                        configChanged = true;
                    } else {
                        this.bootConfig.uid = this.config.uid;
                    }
                    
                    if(!this.config.storage) { this.config.storage = {}; configChanged = true; }
                    if(!this.config.file_meta) { this.config.file_meta = {}; configChanged = true; }
                    
                    const oldStorageStr = JSON.stringify(this.config.storage);
                    if (this.bootConfig.type === 'local') {
                        this.config.storage.local = true;
                    } else {
                        const bConf = { ...this.bootConfig }; delete bConf.handle;
                        this.config.storage[this.bootConfig.type] = bConf;
                    }
                    const newStorageStr = JSON.stringify(this.config.storage);
                    if (oldStorageStr !== newStorageStr) configChanged = true;

                    if (configChanged) {
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
            SystemUI.hideBootScreen();
            SystemUI.hideSyncOverlay(true); CoreCrypto.clearKeys();
            
            if (e.message === 'MELTDOWN') {
                localStorage.clear(); indexedDB.deleteDatabase('SysDB');
                SystemUI.showError(I18nManager.t('core.err_meltdown')); return;
            }
            if (e.message === 'LocalDecryptFailed' || e.message === 'DataCorruptedOrWrongPassword') { SystemUI.showToast(I18nManager.t('core.data_corrupted')); } 
            else if (e.message.startsWith('DataCorrupted:')) { SystemUI.showError((I18nManager.t('core.sys_exception', '') || "Exception: ") + e.message + "\n\n" + (I18nManager.t('core.data_corrupted'))); }
            else if (e.message === 'LocalHandleLost') { SystemUI.showToast(I18nManager.t('core.err_no_fs_api')); this.switchDataSource(false); } 
            else if (e.message === 'RemoteNetworkError') { SystemUI.showError(I18nManager.t('core.net_fallback_title')); }
            else if (e.message === 'RemoteAuthError') { SystemUI.showError(I18nManager.t('core.auth_failed')); this.switchDataSource(false); }
            else if (e.message === 'RemoteVerifyFailed' || e.message === 'RemoteFileNotFound') { SystemUI.showToast(I18nManager.t('core.remote_verify_failed')); this.switchDataSource(false); } 
            else { SystemUI.showToast((I18nManager.t('core.sys_exception', '') || "Exception: ") + (e.message || e.name)); }
        }
    },
    
    async lock() {
        SystemUI.showSyncOverlay(window.I18nManager ? I18nManager.t('core.sync_locking') : 'Locking system...');
        
        try {
            try { SystemVFS._killAllDaemons(); } catch (e) { console.error("[Lock] Kill Daemons Error:", e); }
            
            const hasLocal = !!DataSourceManager.get('local_main');
            const hasRemote = !!SystemVFS._getActiveRemoteSource();

            for (let pid in VFS_State.L0) {
                try {
                    const wTime = VFS_State.L0[pid].write_time;
                    if (VFS_State.L1[pid].sync_time < wTime) {
                        await SystemVFS._reconcileL1(pid);
                        VFS_State.L1[pid].sync_time = wTime;
                    }
                } catch (e) {
                    console.error(`[Lock] L1 Save Failed for ${pid}:`, e);
                }

                if (hasLocal) {
                    try {
                        const wTime = VFS_State.L0[pid].write_time;
                        if (VFS_State.LLocal[pid].sync_time < wTime) {
                            const success = await SystemVFS._reconcileLLocal(pid, true);
                            if (success) VFS_State.LLocal[pid].sync_time = wTime;
                        }
                    } catch (e) {
                        console.error(`[Lock] LLocal Save Failed for ${pid}:`, e);
                    }
                }
            }

            if (hasRemote) {
                for (let pid in VFS_State.L1) {
                    try {
                        const L1 = VFS_State.L1[pid];
                        let isDirty = false;
                        
                        if (Object.keys(L1.unsynced || {}).length > 0) {
                            isDirty = true;
                        } else {
                            for (let fid in L1.filelist) {
                                const node = L1.filelist[fid];
                                if (node.is_dirty_meta || node.sync_version === 0 || node.deleted > 0) {
                                    isDirty = true;
                                    break;
                                }
                            }
                        }
                        
                        if (isDirty) {
                            await SystemVFS.syncCloud(pid, true); 
                        }
                    } catch (e) {
                        console.error(`[Lock] Cloud Sync Failed for ${pid}:`, e);
                    }
                }
            }

        } catch (e) {
            console.error("[Lock] Critical Sync Sequence Error:", e);
        } finally {
            try { SystemUI.hideSyncOverlay(true); } catch(e) {}
            try { DataSourceManager.clear(); } catch(e) {}
            
            VFS_State.L0 = {}; 
            VFS_State.L1 = {}; 
            VFS_State.LLocal = {}; 
            VFS_State.LRemote = {};

            for (let pid in this._loadedPlugins) { 
                try {
                    const pluginDef = window.SystemPlugins.find(p => p.id === pid); 
                    if (pluginDef && window[pluginDef.globalName] && typeof window[pluginDef.globalName].unmount === 'function') { 
                        window[pluginDef.globalName].unmount(this._loadedPlugins[pid]); 
                    } 
                } catch(e) {
                    console.error(`[Lock] Plugin Unmount Crashed [${pid}]:`, e);
                }
                try { this._loadedPlugins[pid].remove(); } catch(e) {}
            }
            this._loadedPlugins = {}; 
            this._currentPlugin = null;
            
            try {
                document.getElementById('sys-plugin-wrapper').innerHTML = ''; 
                document.getElementById('sys-empty-state').style.display = 'flex'; 
                document.getElementById('sys-app-actions').innerHTML = '';
                const appTitle = document.getElementById('sys-app-title'); 
                appTitle.setAttribute('data-i18n', 'core.dock_header'); 
                appTitle.innerText = window.I18nManager ? I18nManager.t('core.dock_header') : 'Privacy OS';
                document.querySelectorAll('.dock-item').forEach(el => el.classList.remove('active'));
            } catch (e) {}
        
            try { CoreCrypto.clearKeys(); } catch(e) { console.error("FATAL: Key clear failed", e); }
            
            this._lastPwd = null; 
            this.config = {}; 
            this.bootConfig = null; 
            
            try { this.stopAutoLock(); } catch(e) {}
            
            try {
                document.getElementById('sys-pwd').value = ""; 
                document.getElementById('sys-pwd2').value = ""; 
            } catch(e) {}
        
            try {
                SystemUI.switchScreen('sys-lock-screen'); 
                if (window.I18nManager) SystemUI.showToast(I18nManager.t('core.locked_safe')); 
                SystemUI.toggleSidebar(true); 
                document.getElementById('sys-dock').classList.remove('expanded'); 
            } catch(e) {}
            
            this.boot(); 
        }
    },
    
    async loadPlugins(isEager = false) {
        const listEl = document.getElementById('dock-plugins-list'); listEl.innerHTML = '';
        if (!window.SystemPlugins || window.SystemPlugins.length === 0) { 
            listEl.innerHTML = `<div style="padding:15px; color:var(--sys-text-muted); font-size:0.9rem; text-align:center; font-weight:500;" data-i18n="core.no_plugins">${window.I18nManager ? I18nManager.t('core.no_plugins') : 'No plugins'}</div>`; 
            return; 
        }
        
        const wrapper = document.getElementById('sys-plugin-wrapper');
        const i18nPromises = window.SystemPlugins.map(plugin => { if (plugin.i18n && !document.querySelector(`script[src="${plugin.i18n}"]`)) { return this._loadScript(plugin.i18n).catch(e => {}); } return Promise.resolve(); });
        await Promise.all(i18nPromises);

        for (let plugin of window.SystemPlugins) {
            const btn = document.createElement('div'); btn.className = 'dock-item'; 
            const text = window.I18nManager ? I18nManager.t(plugin.nameI18nKey) : plugin.id; 
            btn.title = text; 
            const iconName = plugin.icon || 'extension'; 
            btn.innerHTML = `<span class="material-symbols-rounded">${iconName}</span><span class="plugin-name" ${plugin.nameI18nKey ? `data-i18n="${plugin.nameI18nKey}"` : ''}>${text}</span>`;
            btn.onclick = function() { SystemCore.activatePlugin(plugin, this); }; listEl.appendChild(btn);

            if (isEager) {
                const pContainer = document.createElement('div'); pContainer.className = 'plugin-container'; pContainer.id = 'plugin-' + plugin.id; pContainer.style.display = 'none';
                wrapper.appendChild(pContainer);
                try {
                    if (plugin.style) this._loadStyle(plugin.style);
                    if (plugin.script) await this._loadScript(plugin.script);
                    const pluginObj = window[plugin.globalName];
                    if (pluginObj) {
                        this._loadedPlugins[plugin.id] = pContainer;
                        await pluginObj.mount(pContainer);
                    }
                } catch(e) { console.error("Plugin Eager Load Failed:", plugin.id, e); }
            }
        }
    },

    async activatePlugin(plugin, clickedElement) {
        if (this._currentPlugin && window[plugin.globalName] && this._currentPlugin === window[plugin.globalName]) { if (window.innerWidth <= 768) { SystemUI.toggleSidebar(true); } return; }
        document.querySelectorAll('.dock-item').forEach(el => el.classList.remove('active')); if (clickedElement) clickedElement.classList.add('active'); document.getElementById('sys-empty-state').style.display = 'none';
        
        const appTitle = document.getElementById('sys-app-title'); const appActions = document.getElementById('sys-app-actions');
        let pName = window.I18nManager ? I18nManager.t(plugin.nameI18nKey) : plugin.id; 
        if(plugin.nameI18nKey) appTitle.setAttribute('data-i18n', plugin.nameI18nKey); else appTitle.removeAttribute('data-i18n');
        appTitle.innerText = pName; appActions.innerHTML = ''; 
        
        if (this._currentPlugin && typeof this._currentPlugin.onDeactivate === 'function') { this._currentPlugin.onDeactivate(); }
        Object.values(this._loadedPlugins).forEach(container => { container.style.display = 'none'; container.classList.remove('active'); });

        if (!this._loadedPlugins[plugin.id]) {
            if (window.I18nManager) SystemUI.showToast(I18nManager.t('core.starting', pName));
            const wrapper = document.getElementById('sys-plugin-wrapper'); const pContainer = document.createElement('div'); pContainer.className = 'plugin-container active'; pContainer.id = 'plugin-' + plugin.id;
            const loadingText = window.I18nManager ? I18nManager.t('core.loading_plugin', pName) : 'Loading...';
            pContainer.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--sys-text-muted); width: 100%;">${loadingText}</div>`; wrapper.appendChild(pContainer);
            try {
                if (plugin.style) this._loadStyle(plugin.style); if (plugin.script) await this._loadScript(plugin.script);
                const pluginObj = window[plugin.globalName]; if (!pluginObj) throw new Error("Plugin object not found");
                this._currentPlugin = pluginObj; this._loadedPlugins[plugin.id] = pContainer; pContainer.innerHTML = ''; 
                await this._currentPlugin.mount(pContainer);
            } catch (e) { 
                const failText = window.I18nManager ? I18nManager.t('core.load_failed') : 'Load failed';
                pContainer.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--sys-danger); width: 100%;">${failText}: ${e.message}</div>`; 
            }
        } else {
            this._currentPlugin = window[plugin.globalName]; const pContainer = this._loadedPlugins[plugin.id]; pContainer.style.display = 'flex'; pContainer.classList.add('active');
        }

        if (typeof this._currentPlugin.onActivate === 'function') { this._currentPlugin.onActivate(); }
        if (window.innerWidth <= 768) { SystemUI.toggleSidebar(true); }
    },

    switchDataSource(silent = false) {
        const doSwitch = () => { localStorage.removeItem('sys_boot_config_enc'); localStorage.removeItem('sys_boot_config'); this.bootConfig = null; CoreCrypto.clearKeys(); CoreDB.set('sys_dir_handle', null).then(() => { location.reload(); }); };
        if (silent === true) { doSwitch(); } else { SystemUI.showConfirm(window.I18nManager ? I18nManager.t('core.confirm_switch') : 'Confirm switch?', doSwitch); }
    },
    
    async saveSettings() {
        if (!window.I18nManager) return;
        I18nManager.setLang(document.getElementById('sys-lang-select').value); 
        I18nManager.translateDOM(); 
        
        const st = {}; const bType = this.bootConfig?.type;
        this.config.auto_lock = parseInt(document.getElementById('sys-auto-lock-select').value) || 0;
        
        const isLocalChecked = document.getElementById('set-chk-local').checked;
        if (isLocalChecked || bType === 'local') {
            st.local = true;
            localStorage.removeItem('sys_local_opt_out');
        } else {
            st.local = this.config.storage?.local || false; 
            localStorage.setItem('sys_local_opt_out', 'true');
            await CoreDB.set('sys_dir_handle', null);
        }

        if (document.getElementById('set-chk-github').checked || bType === 'github') { st.github = { token: document.getElementById('set-gh-token').value.trim(), repo: document.getElementById('set-gh-repo').value.trim() }; if (bType === 'github') { this.bootConfig.token = st.github.token; this.bootConfig.repo = st.github.repo; } }
        if (document.getElementById('set-chk-api').checked || bType === 'api') { st.api = { url: document.getElementById('set-api-url').value.trim(), token: document.getElementById('set-api-token').value.trim() }; if (bType === 'api') { this.bootConfig.url = st.api.url; this.bootConfig.token = st.api.token; } }
        this.config.storage = st;
        try { 
            await this.saveSysConfig(); await this.saveEncryptedBootConfig(); 
            await this._setupDataSources(); 
            this.startAutoLock();
            document.getElementById('sys-settings-modal').style.display = 'none'; SystemUI.showToast(I18nManager.t('core.save') + " (OK)"); 
            if (this._currentPlugin && typeof this._currentPlugin.onConfigChange === 'function') { this._currentPlugin.onConfigChange(); } 
        } catch (e) { SystemUI.showToast(`${I18nManager.t('core.save_failed')}: ${e.message}`); }
    },
    
    _loadScript(src) { return new Promise((resolve, reject) => { if (document.querySelector(`script[src="${src}"]`)) return resolve(); const script = document.createElement('script'); script.src = src; script.onload = resolve; script.onerror = () => reject(new Error(`Failed to load ${src}`)); document.body.appendChild(script); }); },
    _loadStyle(href) { if (document.querySelector(`link[href="${href}"]`)) return; const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.appendChild(link); },
    
    loadLibrary(type, filename) {
        if (type === 'script' || type === 'js') return this._loadScript(`libs/scripts/${filename}`);
        else if (type === 'css' || type === 'style') { this._loadStyle(`libs/css/${filename}`); return Promise.resolve(); } 
        else if (type === 'image' || type === 'img') return Promise.resolve(`libs/images/${filename}`);
        return Promise.reject(new Error("Unknown library type: " + type));
    }
};

document.getElementById('sys-btn-bind').onclick = () => SystemCore.handleBindStorage();
document.getElementById('sys-btn-unlock').onclick = () => SystemCore.handleAuth();
document.getElementById('sys-pwd').onkeydown = (e) => { if (e.key === 'Enter') SystemCore.handleAuth(); };
document.getElementById('sys-pwd2').onkeydown = (e) => { if (e.key === 'Enter') SystemCore.handleAuth(); };
const bindSetupEnter = (e) => { if (e.key === 'Enter') SystemCore.handleBindStorage(); };
if (document.getElementById('setup-gh-token')) document.getElementById('setup-gh-token').onkeydown = bindSetupEnter;
if (document.getElementById('setup-gh-repo')) document.getElementById('setup-gh-repo').onkeydown = bindSetupEnter;
if(document.getElementById('sys-confirm-btn')) { document.getElementById('sys-confirm-btn').onclick = () => { if (SystemUI.confirmCallback) SystemUI.confirmCallback(); SystemUI.closeConfirm(); }; }

document.addEventListener('contextmenu', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
});

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); 
        if (window.I18nManager) SystemUI.showToast(I18nManager.t('core.auto_saved'));
    }
});

window.addEventListener('DOMContentLoaded', () => SystemCore.boot());