/**
 * ==========================================================================
 * Privacy OS - 国际化 (i18n) 核心配置字典
 * ==========================================================================
 * * 💡 【词条存放规范指北】
 * * 1. 核心层 (coreDict) -> 存放在本文件中: 
 * - 存放跨应用、跨界面的【全局通用词汇】(如: 确定、取消、创建、删除、保存、系统设置等)。
 * - 存放底层操作系统的状态提示、网络状态、报错说明、安全相关文本等。
 * - 调用方式: 优先使用 `I18nManager.t('core.xxx')` 或 `data-i18n="core.xxx"`。
 * * 2. 插件层 (pluginDicts) -> 存放在各个插件专属的 i18n.js 中:
 * - 仅存放该应用特有的词汇 (如: "扫描二维码"、"新建文件夹"、"Secret Key" 等)。
 * - 切勿在插件中重复定义 "Confirm" / "Delete" 等通用按钮，请直接调用 core 字典。
 * - 调用方式: `I18nManager.t('app_name.xxx')` 或 `data-i18n="app_name.xxx"`。
 * ==========================================================================
 */

window.I18nManager = {
    currentLang: 'en',
    
    coreDict: {
        'zh': {
            // ==========================================================
            // 1. 通用按钮与基础词汇 (Common Actions)
            // ==========================================================
            'cancel': '取消', 
            'confirm': '确定', 
            'create': '创建', 
            'delete': '删除', 
            'rename': '重命名',
            'save': '保存设置', 
            'btn_i_know': '我知道了', 
            'btn_later': '稍后处理', 
            'btn_retry': '重新连接 (推荐)', 
            'btn_use_local': '强制使用本地缓存',
            'btn_copy_err': '复制错误信息',
            'msg_copied': '已复制到剪贴板',
            'success': '操作成功',

            // ==========================================================
            // 2. 操作系统界面与基础状态 (System UI & Status)
            // ==========================================================
            'sys_title': '隐私系统', 
            'dock_header': 'Privacy OS', 
            'empty_state': '请从侧边栏选择应用',
            'sys_init': '系统初始化', 
            'sys_check_env': '核心环境就绪。', 
            'theme': '主题设置', 
            'language': '显示语言 / Language', 
            'no_plugins': '暂无可用插件', 
            'auto_saved': '✨ 已安全存入本地工作台 (Auto-Saved)',

            // ==========================================================
            // 3. 密码、安全机制与锁屏 (Security & Lock)
            // ==========================================================
            'sys_locked': '系统已锁定', 
            'sys_locked_desc': '请输入主密码解密数据。',
            'sys_create_pwd': '全新系统', 
            'sys_create_pwd_desc': '启动源已挂载。请设置系统级主密码 (绝不上传，不可找回!)',
            'pwd_placeholder': '输入主密码', 
            'pwd_confirm': '再次输入以确认主密码', 
            'pwd_empty': '密码不可为空', 
            'pwd_short': '密码太短，至少需要4位', 
            'pwd_mismatch': '两次输入的密码不一致！',
            'pwd_tip': '💡 密码安全与加密白皮书\n\n【建议规范】：请使用 32 位以上的高强度主密码（大/小写字母+数字+特殊符号）。\n\n【记忆技巧】：推荐使用「模块化拼接法」。将一段易记的基础模块（如 MySecret2026），结合不同符号重复拼接。例如：MySecret2026!MySecret2026@MySecret2026#（长度达39位）\n\n【系统防御机制】：本系统底层采用双轨 PBKDF2（120万次 SHA-256 哈希迭代）派生双层 AES-256-GCM 密钥。在此极高计算延迟的焦油坑防御下，即便黑客完全知晓您的拼接逻辑，穷举 30+ 位长度密码所需的时间也远超宇宙寿命。纯暴力破解在物理学上绝无可能。',
            'auth_success': '验证通过',
            
            'auto_lock': '自动锁定时间',
            'lock_never': '不自动锁定',
            'lock_1m': '1 分钟',
            'lock_3m': '3 分钟',
            'lock_5m': '5 分钟',
            'lock_10m': '10 分钟',
            'lock_30m': '30 分钟',
            'lock_60m': '60 分钟',
            'lock_120m': '120 分钟',

            // ==========================================================
            // 4. 设置与存储引擎配置 (Settings & Storage)
            // ==========================================================
            'settings': '系统设置', 
            'settings_storage': '同步与存储引擎配置', 
            'sys_uninitialized': '尚未配置启动源，请选择数据挂载方式。', 
            'sys_setup_boot': '选择启动数据源：', 
            
            'st_local': '启用本地文件夹同步', 
            'st_github': 'GitHub Repo 同步', 
            'st_api': 'Custom API 同步 (开发中)',
            'storage_local': '本地文件夹 (仅限电脑端)', 
            'storage_github': 'GitHub Repo (跨平台同步)', 
            'storage_api': 'Custom API (私有服务器 - 开发中)',
            
            'current_dir': '当前绑定目录', 
            'no_dir_bound': '尚未绑定本地目录',
            'gh_token_ph': 'GitHub Token (repo权限)', 
            'gh_repo_ph': 'Repo格式: username/repo', 
            'gh_help_token': '👉 获取 Token', 
            'gh_help_repo': '👉 创建新 Repo',
            'api_url_ph': 'API 根地址 (例如: https://api.xxx.com/data)', 
            'api_token_ph': 'API 鉴权 Token (可选)',
            
            'btn_mount': '挂载引导数据源', 
            'btn_mount_local': '挂载引导数据源 (仅电脑端)',
            'btn_unlock': '解密并唤醒', 
            'btn_create': '加密并初始化',
            'btn_lock': '锁定系统', 
            'btn_rebind_local': '重新选择/授权', 
            'btn_switch_source': '切换启动数据源',
            
            'confirm_title': '操作确认', 
            'confirm_switch': '确定要清空本地配置并重新选择启动数据源吗？系统将重启。',

            // ==========================================================
            // 5. 核心启动与同步加载提示 (Sync & Execution)
            // ==========================================================
            'sync_detect_lineage': '正在检测数据源血统...',
            'sync_format_confirm': '未检测到系统数据。\n\n系统将格式化此目录（物理清空所有文件），并将当前工作台数据同步至此。是否继续？',
            'sync_formatting': '正在格式化目录并写入数据...',
            'sync_mount_success': '目录挂载成功！数据正在后台同步。',
            'sync_format_failed': '格式化目录失败，请检查文件占用或权限：{0}',
            'sync_mount_history_success': '历史备份挂载成功！后台正在静默恢复您的文件...',

            'starting': '启动 {0} ...', 
            'loading_plugin': '正在加载 {0}...',
            'load_failed': '加载失败',
            'locked_safe': '系统已安全清理所有内存并锁定',
            'detecting_storage': '正在探测存储池...', 
            'processing_key': '正在处理底层硬件密钥...', 
            'verifying_remote': '本地解密成功，正在拉取并校验云端数据...',
            'sync_saving_core': '正在全域保存底层核心配置...',
            'sync_locking': '系统正在安全锁定，执行最终数据收口...',
            'sync_app_data': '正在云端同步应用数据 [{0}] ，请耐心等待...',
            'sync_success': '云端同步成功',
            'sync_exception': '云端同步发生异常',
            'sync_pulling_list': '正在拉取云端应用数据...',
            'sync_pulling_file': '正在从云端读取文件内容...',
            'save_failed': '保存失败',
            
            'boot_waking_base': '极速唤醒底层数据: [{0}]...',
            'boot_warming_editor': '预热核心编辑器引擎 (Monaco & Vditor)...',
            'boot_vfs_align': '执行 VFS 极速状态对齐 (0 IO 阻塞)...',
            'boot_preloading_plugins': '后台静默预热应用插件 (Eager Load)...',
            'boot_ready': '系统核心完全就绪！',
            'boot_failed': '系统引导失败: {0}',
            'boot_connecting': '正在连接主数据源进行安全终极校验...',

            'sync_pulling_diff': '拉取云端代码用于对比...',
            'sync_exporting_local': '正在镜像导出到本地...',
            'sync_importing_files': '正在读取文件...',
            'sync_importing_dir': '正在导入目录 [{0}]...',
            'sync_scanning_folder': '正在扫描文件夹结构...',
            'sync_atomic_writing': '正在原子化写入工作区...',
            'sync_writing_workspace': '正在写入工作区...',
            
            'import_conflict_title': '命名冲突',
            'import_conflict_desc1': '目标位置已存在同名项目',
            'import_conflict_desc2': '请选择操作方式：',
            'multi_conflict_files': '多个冲突文件',
            'btn_merge': '覆盖 / 合并',
            'btn_keep_both': '保留两者 (自动重命名)',
            'btn_cancel_import': '取消导入',

            // ==========================================================
            // 6. 错误处理与异常警报 (Errors & Exceptions)
            // ==========================================================
            'error_title': '系统错误',
            'sys_exception': '系统异常: {0}',
            'data_corrupted': '解密失败：密码错误或数据被篡改',
            'remote_verify_failed': '数据源解密失败或被篡改，本地配置已强制清空！',
            'mount_failed': '挂载失败: {0}', 
            'connect_failed_detail': '连接失败: {0}',
            'err_no_fs_api': '当前浏览器不支持本地文件夹选择',
            'err_gh_incomplete': '请填写完整的 GitHub Token 和 Repo 信息', 
            'err_api_incomplete': '请填写 API 根地址',
            'no_cloud_configured': '操作被拒绝：您尚未在设置中启用任何云端同步引擎。',
            'gh_err_not_found': '找不到代码库 [{0}]。请核对：1.拼写是否正确；2.Token权限是否勾选了 "repo"。',
            'gh_err_empty_repo': '代码库 [{0}] 是空的。全量原子同步必须基于一个存在的基准分支，请先去 GitHub 手动添加一个空文件初始化分支。',
            'gh_err_conflict': '云端分支发生物理冲突',
            'gh_err_reject': 'GitHub 拒绝了批量合并请求',
            'vfs_err_circular_move': '非法的目录操作：不能将文件夹移动到它自己的子文件夹中。',
            
            'err_export_failed': '导出失败: {0}',
            'err_import_failed': '导入失败: {0}',
            'err_pwd_released': '无法验证：主密码已从内存释放，请重新登录后再试。',
            'err_uid_mismatch': '危险：血统不符！\n\n该数据源属于另一个完全不同的 Privacy OS 系统 (UID不一致)。\n为防止数据污染，严禁挂载！',
            'err_mount_failed_detail': '挂载失败：\n{0}',
            'err_mount_canceled': '挂载取消: {0}',
            'err_meltdown': '安全警报：主数据源配置解密失败！\n\n系统判定为主密码已被异地修改，或主源核心配置遭到毁灭性破坏。\n\n【最高级别熔断启动】：为保护您的数据安全，本设备留存的本地数据库和敏感缓存已被紧急清空！请刷新页面并重新绑定数据源。',
            'err_no_monaco': '未找到 Monaco',
            'err_vditor_timeout': 'Vditor 加载超时',
            'err_vditor_failed': 'Vditor 加载失败',
            'engine_load_failed': '引擎加载失败',
            
            'net_fallback_title': '云端连接失败',
            'net_fallback_desc': '获取 <b>[{0}]</b> 时发生网络异常。云端是系统唯一的安全基准，建议您检查网络后重试。<br><br>如果您确实处于离线环境，可以强制使用本地缓存继续操作。',

            // ==========================================================
            // 7. 冲突解决与版本回滚 (Conflicts & Rollback)
            // ==========================================================
            'conflict_title': '解决冲突 (Diff Merge)',
            'msg_conflict_pending': '提示：发现延迟挂起的冲突文件',
            'diff_resolve_title': '解决冲突 (Diff Merge) - {0}',
            'diff_left_desc': '<b>左侧 (只读)</b>：云端代码 (v{0})，同步于 {1}',
            'diff_right_desc': '<b>右侧 (可编辑)</b>：本地代码 (v{0})，修改于 {1}',
            'diff_loading': '正在加载对比引擎...',
            'diff_btn_cloud': '☁️ 放弃本地，完全覆盖为左侧云端',
            'diff_btn_merge': '🚀 以右侧为准，标记已解决并推送到云端',
            'diff_engine_failed': '引擎加载失败: {0}',
            
            'rollback_title_dirty': '🔥 严重安全警告：云端异常倒退',
            'rollback_title_clean': '⚠️ 警告：云端版本低于本地',
            'rollback_desc_dirty': '检测到文件 <b>{0}</b> 的云端版本 (v{1}) 已异常倒退至低于本地的水平 (v{2})。并且，<b>您本地还有未同步的最新修改</b>！直接拉取将导致您的心血永久丢失。',
            'rollback_desc_clean': '检测到文件 <b>{0}</b> 的云端版本 (v{1}) 低于本地记录的版本 (v{2})。云端可能发生了人为回滚或被旧设备覆盖。',
            'rollback_btn_force_dirty': '🚀 (推荐) 保留本地工作，强制修复云端',
            'rollback_btn_force_clean': '💻 提取本地快照，强制覆盖修复云端',
            'rollback_btn_force_desc': '系统将把本地内容强行推送到云端，并将版本号重置至最新水平。',
            'rollback_btn_accept': '☁️ 接受降级，以云端旧版本为准',
            'rollback_warn_dirty': '<strong style="color:#ff5252;">警告：您本地的修改将永久丢失！</strong>',
            'rollback_warn_clean': '丢弃本地高版本记录，回退至云端内容。',
            
            // ==========================================================
            // 8. 独立本地同步授权面板 (Local Bind UI)
            // ==========================================================
            'local_bind_title': '本地工作区就绪确认',
            'local_bind_desc_missing': '云端全局配置显示您已开启了【本地同步】，但当前设备尚未绑定具体存放文件夹。\n\n是否立即为该设备绑定一个本地目录以开启实时备份？',
            'local_bind_desc_expired': '由于浏览器的隐私安全机制，系统之前绑定的本地文件夹读写权限已失效。\n\n点击下方按钮一键重新授权，即可恢复后台静默同步。',
            'btn_bind_now': '🚀 立即绑定 / 授权',
            'btn_disable_local': '在此设备关闭本地同步',
            'perm_restored': '✅ 本地权限已就绪！后台引擎已接管...'
        },
        'en': {
            // ==========================================================
            // 1. Common Actions
            // ==========================================================
            'cancel': 'Cancel', 
            'confirm': 'Confirm', 
            'create': 'Create', 
            'delete': 'Delete', 
            'rename': 'Rename',
            'save': 'Save Settings', 
            'btn_i_know': 'OK', 
            'btn_later': 'Decide Later', 
            'btn_retry': 'Retry Connection', 
            'btn_use_local': 'Force Local Cache',
            'btn_copy_err': 'Copy Error',
            'msg_copied': 'Copied to clipboard',
            'success': 'Success',

            // ==========================================================
            // 2. System UI & Status
            // ==========================================================
            'sys_title': 'Privacy OS', 
            'dock_header': 'Privacy OS', 
            'empty_state': 'Select an app from the sidebar',
            'sys_init': 'System Initialization', 
            'sys_check_env': 'Core environment ready.', 
            'theme': 'Theme', 
            'language': 'Language / 显示语言', 
            'no_plugins': 'No plugins available', 
            'auto_saved': '✨ Safely saved to local workspace (Auto-Saved)',

            // ==========================================================
            // 3. Security & Lock
            // ==========================================================
            'sys_locked': 'System Locked', 
            'sys_locked_desc': 'Enter master password to decrypt data.',
            'sys_create_pwd': 'New System', 
            'sys_create_pwd_desc': 'Boot source mounted. Set master password (never uploaded, unrecoverable!).',
            'pwd_placeholder': 'Enter master password', 
            'pwd_confirm': 'Confirm master password', 
            'pwd_empty': 'Password cannot be empty', 
            'pwd_short': 'Password is too short (min 4 chars)', 
            'pwd_mismatch': 'Passwords do not match!',
            'pwd_tip': '💡 Password & Encryption Whitepaper\n\n[Standard]: Please use a strong master password of 32+ characters (upper/lowercase + numbers + symbols).\n\n[Memory Tip]: We recommend "Modular Splicing". Use a memorable base module (e.g., MySecret2026) and repeat it with different trailing symbols. E.g., MySecret2026!MySecret2026@MySecret2026# (39 chars)\n\n[Defense Mechanism]: This system relies on dual-track PBKDF2 (1.2 million SHA-256 iterations) to derive double-layer AES-256-GCM keys. With this extreme computational delay, even if attackers know your splicing logic, brute-forcing a 30+ char password would take longer than the lifespan of the universe. It is physically impossible to crack.',
            'auth_success': 'Authentication successful',
            
            'auto_lock': 'Auto Lock Time',
            'lock_never': 'Never',
            'lock_1m': '1 min',
            'lock_3m': '3 mins',
            'lock_5m': '5 mins',
            'lock_10m': '10 mins',
            'lock_30m': '30 mins',
            'lock_60m': '60 mins',
            'lock_120m': '120 mins',

            // ==========================================================
            // 4. Settings & Storage
            // ==========================================================
            'settings': 'System Settings', 
            'settings_storage': 'Storage & Sync Engines', 
            'sys_uninitialized': 'No boot source configured. Please select a mount point.', 
            'sys_setup_boot': 'Select Boot Data Source:', 
            
            'st_local': 'Enable Local Sync', 
            'st_github': 'GitHub Repo Sync', 
            'st_api': 'Custom API Sync (WIP)',
            'storage_local': 'Local Folder (PC only)', 
            'storage_github': 'GitHub Repo (Cross-platform)', 
            'storage_api': 'Custom API (Private Server - WIP)',
            
            'current_dir': 'Current Dir', 
            'no_dir_bound': 'No local directory bound',
            'gh_token_ph': 'GitHub Token', 
            'gh_repo_ph': 'username/repo', 
            'gh_help_token': '👉 Get Token', 
            'gh_help_repo': '👉 Create New Repo',
            'api_url_ph': 'API URL', 
            'api_token_ph': 'Token (Optional)',
            
            'btn_mount': 'Mount Boot Source', 
            'btn_mount_local': 'Mount Boot Source (PC only)',
            'btn_unlock': 'Decrypt & Wake', 
            'btn_create': 'Encrypt & Init',
            'btn_lock': 'Lock System', 
            'btn_rebind_local': 'Select/Auth Local Directory', 
            'btn_switch_source': 'Switch Boot Source',
            
            'confirm_title': 'Confirmation', 
            'confirm_switch': 'Are you sure you want to clear config and select a new boot source? System will restart.',

            // ==========================================================
            // 5. Sync & Execution
            // ==========================================================
            'sync_detect_lineage': 'Detecting data source lineage...',
            'sync_format_confirm': 'No system data detected.\n\nThe system will format this directory (physically clearing all files) and sync current workspace data to it. Continue?',
            'sync_formatting': 'Formatting directory and writing data...',
            'sync_mount_success': 'Directory mounted successfully! Data is syncing in background.',
            'sync_format_failed': 'Failed to format directory, check locks or permissions: {0}',
            'sync_mount_history_success': 'Historical backup mounted successfully! Silently restoring your files...',

            'starting': 'Starting {0} ...', 
            'loading_plugin': 'Loading {0}...',
            'load_failed': 'Load failed',
            'locked_safe': 'Memory securely cleared and locked',
            'detecting_storage': 'Detecting storage pool...', 
            'processing_key': 'Processing hardware key...', 
            'verifying_remote': 'Local decrypted, verifying remote data integrity...',
            'sync_saving_core': 'Saving core configuration globally...',
            'sync_locking': 'System locking securely, executing final data sync...',
            'sync_app_data': 'Syncing app data [{0}] to cloud, please wait...',
            'sync_success': 'Cloud sync successful',
            'sync_exception': 'Cloud sync exception occurred',
            'sync_pulling_list': 'Pulling cloud app data...',
            'sync_pulling_file': 'Reading file content from cloud...',
            'save_failed': 'Save failed',
            
            'boot_waking_base': 'Waking up base data: [{0}]...',
            'boot_warming_editor': 'Warming up editor engines (Monaco & Vditor)...',
            'boot_vfs_align': 'Executing fast VFS state alignment (0 IO Block)...',
            'boot_preloading_plugins': 'Preloading plugins silently in background (Eager Load)...',
            'boot_ready': 'System core fully ready!',
            'boot_failed': 'System boot failed: {0}',
            'boot_connecting': 'Connecting to main data source for ultimate verification...',
            
            'sync_pulling_diff': 'Pulling cloud code for diff...',
            'sync_exporting_local': 'Mirroring export to local...',
            'sync_importing_files': 'Importing files...',
            'sync_importing_dir': 'Importing directory [{0}]...',
            'sync_scanning_folder': 'Scanning folder structure...',
            'sync_atomic_writing': 'Atomically writing to workspace...',
            'sync_writing_workspace': 'Writing to workspace...',
            
            'import_conflict_title': 'Naming Conflict',
            'import_conflict_desc1': 'An item with the same name already exists: ',
            'import_conflict_desc2': 'Please select an action:',
            'multi_conflict_files': 'Multiple Conflicting Files',
            'btn_merge': 'Overwrite / Merge',
            'btn_keep_both': 'Keep Both (Auto Rename)',
            'btn_cancel_import': 'Cancel Import',

            // ==========================================================
            // 6. Errors & Exceptions
            // ==========================================================
            'error_title': 'System Error',
            'sys_exception': 'System exception: {0}',
            'data_corrupted': 'Decryption failed: wrong password or tampered data',
            'remote_verify_failed': 'Remote data decrypt failed. Local cache forcefully reset!',
            'mount_failed': 'Mount failed: {0}', 
            'connect_failed_detail': 'Connection failed: {0}',
            'err_no_fs_api': 'Browser does not support File System Access API',
            'err_gh_incomplete': 'Please fill in complete GitHub information', 
            'err_api_incomplete': 'Please fill in API URL',
            'no_cloud_configured': 'Denied: No cloud storage engine enabled in settings.',
            'gh_err_not_found': 'Repository [{0}] not found. Check: 1. Spelling; 2. Token has "repo" scope.',
            'gh_err_empty_repo': 'Repository [{0}] is empty. Atomic sync requires a base branch. Please manually add an empty file (e.g., README.md) on GitHub first.',
            'gh_err_conflict': 'Cloud branch conflict occurred',
            'gh_err_reject': 'GitHub rejected batch merge request',
            'vfs_err_circular_move': 'Illegal operation: Cannot move a directory into its own subdirectory.',
            
            'err_export_failed': 'Export failed: {0}',
            'err_import_failed': 'Import failed: {0}',
            'err_pwd_released': 'Cannot verify: Master password released from memory, please re-login.',
            'err_uid_mismatch': 'Danger: Lineage mismatch!\n\nThis data source belongs to a completely different Privacy OS (UID mismatch).\nMounting is strictly prohibited to prevent pollution!',
            'err_mount_failed_detail': 'Mount failed:\n{0}',
            'err_mount_canceled': 'Mount canceled: {0}',
            'err_meltdown': 'Security Alert: Main data source config decryption failed!\n\nSystem determines the master password was changed elsewhere, or main core config is destroyed.\n\n[MAXIMUM MELTDOWN INITIATED]: Local database and sensitive caches have been emergency cleared! Refresh and rebind.',
            'err_no_monaco': 'Monaco not found',
            'err_vditor_timeout': 'Vditor load timeout',
            'err_vditor_failed': 'Failed to load Vditor',
            'engine_load_failed': 'Engine load failed',
            
            'net_fallback_title': 'Cloud Connection Failed',
            'net_fallback_desc': 'Network error occurred while fetching <b>[{0}]</b>. The cloud is your primary secure backup. Please check your connection and retry.<br><br>If offline, you may force using local cache.',

            // ==========================================================
            // 7. Conflicts & Rollback
            // ==========================================================
            'conflict_title': 'Resolve Conflict (Diff Merge)',
            'msg_conflict_pending': 'Hint: Found delayed pending conflict files',
            'diff_resolve_title': 'Resolve Conflict (Diff Merge) - {0}',
            'diff_left_desc': '<b>Left (Read-only)</b>: Cloud code (v{0}), synced at {1}',
            'diff_right_desc': '<b>Right (Editable)</b>: Local code (v{0}), modified at {1}',
            'diff_loading': 'Loading diff engine...',
            'diff_btn_cloud': '☁️ Discard local, overwrite completely with left cloud',
            'diff_btn_merge': '🚀 Keep right, mark resolved & push to cloud',
            'diff_engine_failed': 'Engine load failed: {0}',
            
            'rollback_title_dirty': '🔥 CRITICAL: Cloud rollback detected',
            'rollback_title_clean': '⚠️ Warning: Cloud version is lower than local',
            'rollback_desc_dirty': 'Cloud version (v{1}) of <b>{0}</b> has rolled back below local (v{2}). AND <b>you have unsynced latest local changes</b>! Direct pull will cause permanent loss of your work.',
            'rollback_desc_clean': 'Cloud version (v{1}) of <b>{0}</b> is lower than local record (v{2}). Cloud may have been manually rolled back or overwritten by an old device.',
            'rollback_btn_force_dirty': '🚀 (Recommended) Keep local work, force fix cloud',
            'rollback_btn_force_clean': '💻 Extract local snapshot, force overwrite cloud',
            'rollback_btn_force_desc': 'System will forcefully push local content to cloud and reset version to latest.',
            'rollback_btn_accept': '☁️ Accept downgrade, fallback to old cloud version',
            'rollback_warn_dirty': '<strong style="color:#ff5252;">Warning: Your local changes will be lost permanently!</strong>',
            'rollback_warn_clean': 'Discard local high version record, revert to cloud content.',
            
            // ==========================================================
            // 8. Local Bind UI
            // ==========================================================
            'local_bind_title': 'Local Workspace Readiness',
            'local_bind_desc_missing': 'Global config indicates [Local Sync] is enabled, but this device lacks a bound folder.\n\nBind a folder now to enable real-time local backup on this device?',
            'local_bind_desc_expired': 'Due to browser security mechanisms, the read/write permission for your bound local folder has expired.\n\nClick below to re-authorize and restore background sync.',
            'btn_bind_now': '🚀 Bind / Authorize Now',
            'btn_disable_local': 'Disable Local Sync on this device',
            'perm_restored': '✅ Local permission restored! Background engine taking over...'
        }
    },
    
    pluginDicts: {},
    init: function() { this.currentLang = localStorage.getItem('sys_config_lang') || (navigator.language.startsWith('zh') ? 'zh' : 'en'); window.addEventListener('DOMContentLoaded', () => this.translateDOM()); },
    setLang: function(l) { this.currentLang = l; localStorage.setItem('sys_config_lang', l); this.translateDOM(); },
    registerPluginDict: function(id, dict) { this.pluginDicts[id] = dict; },
    t: function(key, ...args) {
        let parts = key.split('.'); let dict = (parts[0] === 'core') ? this.coreDict : this.pluginDicts[parts[0]];
        if (!dict) return key; 
        let langDict = dict[this.currentLang] || dict['en']; if (!langDict) return key;
        let text = langDict[parts.slice(1).join('.')] || (dict['en'] && dict['en'][parts.slice(1).join('.')]) || key;
        if (args.length > 0) text = text.replace(/\{(\d+)\}/g, (m, n) => (typeof args[n] !== 'undefined' && args[n] !== null) ? args[n] : '');
        return text;
    },
    translateDOM: function(root = document) {
        root.querySelectorAll('[data-i18n]').forEach(el => {
            let t = this.t(el.getAttribute('data-i18n'));
            if (el.tagName === 'TITLE') document.title = t;
            else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.hasAttribute('placeholder') ? el.placeholder = t : el.value = t; 
            else el.innerText = t;
        });
    }
};

window.I18nManager.init();