# Privacy OS 🛡️

[中文版 (Chinese)](#中文介绍) | [English Version](#english-introduction)

---

## 中文介绍

Privacy OS 是一个完全运行在浏览器中的**本地优先 (Local-first)** 且**端到端加密 (E2EE)** 的私有安全工作系统。它没有任何中心化的后端服务器或云盘绑定，您的所有敏感数据都将在您的本地设备上完成加密，并完全由您自己掌控。

### ✨ 核心特性

* **🔒 极高的军工级安全性 (End-to-End Encryption)**
  系统核心层不依赖任何外部加密服务。它使用您的主密码，通过 `PBKDF2`（60万次迭代）派生出加密密钥，并结合独特的双层 `AES-GCM` 算法对数据进行深度加密。所有数据在离开您的浏览器内存之前，均已被打包为无法被解析的 `SEC2` 加密二进制流。同时具备严格的内存销毁和防注入机制。
* **☁️ 自带存储引擎 (BYOS - Bring Your Own Storage)**
  告别数据孤岛和平台锁定。您可以自由选择数据的存储去向：
  * **本地模式**：基于 Web File System Access API，直接将您的电脑本地文件夹作为加密数据存储池。
  * **GitHub 模式 (跨平台同步推荐)**：绑定您个人的私有 (Private) GitHub Repository，利用云端实现跨设备的多端实时同步。
* **🚀 纯静态架构 (Pure Frontend)**
  开箱即用，零后端依赖。没有数据库，没有 API 接口，完全纯前端运行。
* **🛠️ 内置安全应用 (Built-in Apps)**
  * **Workspace (工作区)**：沉浸式的多标签页文本与代码编辑器。内置虚拟文件系统 (VFS) 状态机，支持多层级目录管理、本地与云端冲突解决机制。
  * **Authenticator (身份验证器)**：本地安全的 TOTP 二步验证器。支持通过剪贴板或上传直接解析二维码，可视化倒计时，并严格加密保护您的所有 Secret Key。
* **⏱️ 自动锁定与内存防护 (Auto-lock)**
  支持自定义无操作自动锁定时间。锁定后，系统会彻底清空内存中的解密状态、DOM 节点和临时变量，防止物理窥探。

### 🚀 部署与运行指引

本项目为纯静态 Web 应用，无需配置任何复杂的开发环境。您可以选择以下任意一种方式运行：

1. **本地直接运行 (最简单)**
   * 下载项目代码后，直接双击打开项目根目录的 `index.html` 文件即可运行。
   * *(注：建议使用 **Chrome 浏览器**。此本地直接打开的方式未在其他浏览器上进行全面测试，部分浏览器可能会因本地跨域策略限制某些功能)*。
2. **本地服务器运行 (推荐)**
   * **使用 VS Code**：在 VS Code 中打开项目文件夹，安装并使用 `Live Server` 插件运行。
   * **使用 Python**：打开终端/命令行，进入项目根目录，运行命令：`python -m http.server 8000`。然后在浏览器中访问 `http://localhost:8000`。
3. **云端托管 (Web Hosting)**
   * 由于是纯静态文件，您可以直接将此仓库零成本部署到 **GitHub Pages**, **Vercel**, **Netlify** 或 **Cloudflare Pages**。

### ⚙️ 系统初始化

首次访问系统时，您需要进行两步初始化：
1. **设置主密码**：该密码将作为最高权限用于派生底层加密密钥。**请务必牢记！出于纯本地加密的特性，主密码一旦丢失，您的所有数据将面临永久性损坏且绝对无法找回！**
2. **配置数据源**：选择“本地文件夹 (Local)”或填入您的“GitHub 个人访问令牌 (Token) 与仓库名”来挂载数据存储池。

---
---

## English Introduction

Privacy OS is a fully in-browser, **local-first**, and **End-to-End Encrypted (E2EE)** private secure workspace system. It operates entirely without centralized backend servers or cloud drive lock-ins. All your sensitive data is encrypted locally on your device, ensuring complete control remains in your hands.

### ✨ Core Features

* **🔒 Military-Grade Security (End-to-End Encryption)**
  The core layer relies on zero external encryption services. It uses your Master Password to derive encryption keys via `PBKDF2` (600,000 iterations), combined with a unique double-layer `AES-GCM` algorithm for deep encryption. All data is packed into an indecipherable `SEC2` encrypted binary stream before it ever leaves your browser's memory. It also features strict memory wiping and anti-injection mechanisms.
* **☁️ Bring Your Own Storage (BYOS)**
  Say goodbye to data silos and platform lock-ins. You have the freedom to choose where your data lives:
  * **Local Mode**: Utilizes the Web File System Access API to mount a local folder on your computer directly as the encrypted data storage pool.
  * **GitHub Mode (Recommended for Sync)**: Bind your personal Private GitHub Repository to achieve real-time, cross-device synchronization via the cloud.
* **🚀 Pure Frontend Architecture**
  Ready to use out-of-the-box with zero backend dependencies. No databases, no API services—just a pure frontend application.
* **🛠️ Built-in Secure Applications**
  * **Workspace**: An immersive, multi-tab text and code editor. It features a built-in Virtual File System (VFS) state machine, multi-level directory management, and a local-cloud conflict resolution mechanism.
  * **Authenticator**: A secure, local TOTP two-factor authenticator. Supports direct QR code parsing via clipboard or file upload, visual countdowns, and strict encryption protection for all your Secret Keys.
* **⏱️ Auto-lock & Memory Protection**
  Supports a customizable auto-lock timer for inactivity. Once locked, the system completely clears decrypted states, DOM nodes, and temporary variables from memory to prevent physical snooping.

### 🚀 Deployment & Running Guide

This project is a pure static Web application and does not require any complex development environment configuration. You can run it using any of the following methods:

1. **Run Locally Directly (Easiest)**
   * After downloading the code, simply double-click the `index.html` file in the root directory to run it.
   * *(Note: **Chrome Browser** is recommended. Opening the local HTML file directly has not been fully tested on other browsers, and some browsers may restrict certain features due to local CORS policies).*
2. **Run via Local Server (Recommended)**
   * **Using VS Code**: Open the project folder in VS Code, install, and use the `Live Server` extension.
   * **Using Python**: Open your terminal/command prompt, navigate to the project root directory, and run the command: `python -m http.server 8000`. Then, visit `http://localhost:8000` in your browser.
3. **Cloud Web Hosting**
   * As pure static files, you can deploy this repository at zero cost to **GitHub Pages**, **Vercel**, **Netlify**, or **Cloudflare Pages**.

### ⚙️ System Initialization

Upon your first visit, you will be guided through a two-step initialization:
1. **Set Master Password**: This password will act as the highest authority to derive the underlying encryption keys. **Please remember it securely! Due to the nature of pure local encryption, if the Master Password is lost, ALL your data will be permanently inaccessible and cannot be recovered!**
2. **Configure Data Source**: Select "Local Folder" or enter your "GitHub Personal Access Token and Repository Name" to mount your data storage pool.

---
---

## ⚖️ 免责声明与第三方协议 (Disclaimer & Third-Party Licenses)

Please read this disclaimer carefully before using, downloading, building, or distributing this software ("Privacy OS" and its related components). By using this software, you agree to be bound by the terms of this disclaimer.
请在使用、下载、构建或分发本软件前仔细阅读以下条款。使用本软件即表示您同意受本免责声明的约束。

### 1. No Warranty & Limitation of Liability (核心免责声明)
**THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.**
**本软件按“原样”提供，不提供任何明示或暗示的担保。**

* **Data Security and Loss Risk (数据安全与丢失风险):** Privacy OS is designed as a local-first, end-to-end encrypted (E2EE) system. All encryption keys, passwords, and user data are stored exclusively on your local device or within a third-party cloud service configured by you. **IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY ARISING FROM DATA LOSS, CORRUPTION, OR COMPROMISE** caused by software defects, environment incompatibility, forgotten passwords, cleared browser caches, device damage, or changes to third-party APIs. You are solely responsible for maintaining secure backups of your critical data and master password.
  开发作者对由于软件缺陷、密码遗忘、缓存清空或第三方 API 变更等任何原因导致的数据丢失、损坏或泄露不承担任何法律责任及赔偿义务。请自行做好数据和密码备份。
* **No Commercial Support (无商业支持):** This project is a personal technical exploration shared as open source. The developers make no commitment to provide technical support, updates, or security patches. 
  本项目为个人开源分享，不承诺提供持续技术支持或更新。

### 2. Privacy & Data Handling (隐私与数据处理声明)
* **Zero Data Collection (零数据收集):** The developers **DO NOT** collect, track, intercept, or upload any of your personal information, configurations, TOTP keys, notes, or any other user-generated content.
  开发者绝对不会收集、拦截或上传您的任何隐私信息或用户生成内容。
* **Third-Party Communications (第三方通信):** The software may communicate directly with third-party APIs (e.g., GitHub API) entirely between your local client and the servers. The developers are not responsible for the data security or privacy policies of these third-party platforms.

### 3. Third-Party Open Source Software (第三方开源软件声明)
The build and execution of this software rely on the following excellent open-source third-party libraries. We express our gratitude to the original authors.
本软件的运行依赖于以下优秀的开源第三方库，特此致谢并声明遵循其原有的开源许可证：

* **pako** (`libs/scripts/pako.min.js`): MIT License
* **otplib** (`libs/scripts/otplib.js`): MIT License
* **jsQR** (`libs/scripts/jsQR.js`): Apache License 2.0 / MIT
* **buffer** (`libs/scripts/buffer.js`): MIT License
* **Material Symbols** (`libs/css/material-symbols.css`): Apache License 2.0 (by Google)

*Note: If the use of this software unintentionally violates the requirements of any third-party license, please raise an Issue, and we will promptly rectify or remove it.*
