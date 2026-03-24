window.SystemPlugins = [
    {
        id: 'app_workspace',
        nameI18nKey: 'app_workspace.app_name',
        icon: 'snippet_folder',
        globalName: 'AppWorkspace',
        script: 'plugins/app_workspace/index.js',
        style: 'plugins/app_workspace/style.css',
        i18n: 'plugins/app_workspace/i18n.js'
    },
    {
        id: 'app_authenticator',
        nameI18nKey: 'app_authenticator.app_name',
        icon: 'vpn_key',
        globalName: 'AppAuthenticator',
        script: 'plugins/app_authenticator/index.js',
        style: 'plugins/app_authenticator/style.css',
        i18n: 'plugins/app_authenticator/i18n.js'
    }
];