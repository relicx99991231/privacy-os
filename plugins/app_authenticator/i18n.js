I18nManager.registerPluginDict('app_authenticator', {
    'zh': {
        'app_name': '身份验证器',
        'add_account': '添加新账号',
        'scan_qr': '选择图片 或 粘贴(Ctrl+V)二维码',
        'or_manual': '或手动输入',
        'account_name': '账号名称 (如: GitHub, 邮箱)',
        'secret_key': '输入 16/32 位密钥 (Secret Key)',
        
        'cat_all': '所有账号',
        'cat_default': '未分类',
        'new_category': '新建分组',
        'manage_category': '分类管理',
        'rename_cat': '重命名分组',
        'delete_cat': '删除分组',
        'move_to': '移动至',
        
        'input_cat_name': '输入分组名称...',
        'create': '创建',
        'confirm': '确定',
        'delete': '删除',
        'category': '所属分组',

        'btn_save': '保存账号',
        'empty_state': '暂无账号，请添加或粘贴二维码',
        'copy_success': '已复制验证码',
        'copy_failed': '复制失败',
        
        'delete_confirm': '确定要删除该账号吗？',
        'del_cat_confirm': '确定要删除分组【{0}】吗？\n(该分组下的账号将被移至“未分类”，不会丢失)',
        
        'qr_invalid': '⚠️ 无效的 TOTP 二维码',
        'qr_no_secret': '⚠️ 缺少 Secret Key',
        'qr_exists': '⚠️ 该账号已存在',
        'qr_success': '✅ 二维码识别成功并添加！',
        'qr_format_err': '❌ 二维码内容格式不正确',
        'qr_not_found': '❌ 未能识别到二维码，请确保图片清晰',
        'err_incomplete': '请完整填写名称和密钥',
        'err_format': '密钥格式不正确',
        'err_exists': '该密钥已存在',
        'err_cat_exists': '该分组名称已存在',
        
        'btn_sync': '写入云端',
        'sync_up_to_date': '所有内容已是最新，无需同步',
        'sync_success': '云端同步成功！',
        
        'view_secret': '查看密钥',
        'copy_secret_success': '密钥已复制！',
        
        'loading_component': '正在注入安全组件...',
        'load_failed': '组件加载失败: 请检查网络',
        'unnamed_account': '未命名账号'
    },
    'en': {
        'app_name': 'Authenticator',
        'add_account': 'Add Account',
        'scan_qr': 'Select Image or Paste (Ctrl+V) QR',
        'or_manual': 'Or Enter Manually',
        'account_name': 'Account Name (e.g., GitHub, Email)',
        'secret_key': 'Enter 16/32-bit Secret Key',
        
        'cat_all': 'All Accounts',
        'cat_default': 'Uncategorized',
        'new_category': 'New Category',
        'manage_category': 'Categories',
        'rename_cat': 'Rename Category',
        'delete_cat': 'Delete Category',
        'move_to': 'Move to',
        
        'input_cat_name': 'Enter category name...',
        'create': 'Create',
        'confirm': 'Confirm',
        'delete': 'Delete',
        'category': 'Category',

        'btn_save': 'Save Account',
        'empty_state': 'No accounts yet. Add or paste a QR code.',
        'copy_success': 'Code copied',
        'copy_failed': 'Copy failed',
        
        'delete_confirm': 'Delete this account?',
        'del_cat_confirm': 'Delete category [{0}]?\n(Accounts will be safely moved to Uncategorized)',
        
        'qr_invalid': '⚠️ Invalid TOTP QR Code',
        'qr_no_secret': '⚠️ Missing Secret Key',
        'qr_exists': '⚠️ Account already exists',
        'qr_success': '✅ QR code recognized and added!',
        'qr_format_err': '❌ Incorrect QR format',
        'qr_not_found': '❌ No QR code found, ensure clarity',
        'err_incomplete': 'Please fill in name and secret',
        'err_format': 'Invalid secret format',
        'err_exists': 'Secret already exists',
        'err_cat_exists': 'Category already exists',
        
        'btn_sync': 'Write to Cloud',
        'sync_up_to_date': 'Up to date',
        'sync_success': 'Cloud sync successful!',
        
        'view_secret': 'View Secret Key',
        'copy_secret_success': 'Secret copied!',
        
        'loading_component': 'Injecting security components...',
        'load_failed': 'Component load failed: Please check network',
        'unnamed_account': 'Unnamed Account'
    }
});