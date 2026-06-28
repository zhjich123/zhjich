// ==UserScript==
// @name         媒体嗅探器 Media Sniffer Pro v8.6.0
// @namespace    http://tampermonkey.net/
// @version      8.6.0
// @description  图片/视频/音频/m3u8 抓取 · AES-128解密 · 分片合并 · 虚拟列表 · 进度可视化 · 跨域兜底 · Cookie/Storage · 翻译 · 元信息 · 高级筛选
// @match        *://*/*
// @exclude      *://*chrome.google.com/*
// @exclude      *://*chromewebstore.google.com/*
// @exclude      *://*microsoft.com/*edge*
// @grant        GM_download
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @run-at       document-end
// @noframes
// @connect      *
// @connect      bilibili.com
// @connect      bilivideo.com
// @connect      b23.tv
// @connect      douyin.com
// @connect      kuaishou.com
// @connect      xiaohongshu.com
// @connect      xhslink.com
// @connect      weibo.com
// @connect      weibo.cn
// @connect      zhihu.com
// @connect      zhimg.com
// @connect      weixin.qq.com
// @connect      qpic.cn
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window.self) {
        return;
    }

    // =========================================================================
    // 🧩 模块 1：核心工具 (Utils) + 日志系统
    // =========================================================================
    var U = {};
    U.VERSION = '8.6.0';
    U.toStr = Object.prototype.toString;
    U.isArr = Array.isArray || function (x) { return U.toStr.call(x) === '[object Array]'; };
    U.isStr = function (x) { return typeof x === 'string'; };
    U.isNum = function (x) { return typeof x === 'number' && !isNaN(x); };
    U.isFn = function (x) { return typeof x === 'function'; };
    U.now = function () { return Date.now(); };
    U.uid = function () { return 'u' + U.now().toString(36) + Math.random().toString(36).slice(2, 8); };

    // ===== 日志系统（分级 debug/info/warn/error）=====
    var LOG = {};
    LOG.LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    LOG.level = LOG.LEVELS.INFO; // 默认 INFO 级别
    LOG.prefix = '[MS-v8]';
    LOG._out = function (lvl, args) {
        if (lvl < LOG.level) return;
        var method = lvl === 0 ? 'log' : lvl === 1 ? 'info' : lvl === 2 ? 'warn' : 'error';
        try { console[method].apply(console, [LOG.prefix].concat(Array.from(args))); } catch (e) {}
    };
    LOG.debug = function () { LOG._out(0, arguments); };
    LOG.info = function () { LOG._out(1, arguments); };
    LOG.warn = function () { LOG._out(2, arguments); };
    LOG.error = function () { LOG._out(3, arguments); };
    LOG.setLevel = function (lvl) { if (U.isNum(lvl) && lvl >= 0 && lvl <= 3) LOG.level = lvl; };

    // ===== 防抖/节流 =====
    U.debounce = function (fn, wait) {
        var t = null;
        return function () {
            var ctx = this, args = arguments;
            if (t) clearTimeout(t);
            t = setTimeout(function () { fn.apply(ctx, args); }, wait);
        };
    };
    U.throttle = function (fn, wait) {
        var last = 0, t = null;
        return function () {
            var ctx = this, args = arguments, n = U.now();
            var rem = wait - (n - last);
            if (rem <= 0) { if (t) { clearTimeout(t); t = null; } last = n; fn.apply(ctx, args); }
            else if (!t) { t = setTimeout(function () { last = U.now(); t = null; fn.apply(ctx, args); }, rem); }
        };
    };

    // ===== requestIdleCallback 兼容 =====
    U.rIC = function (cb, opts) {
        try {
            if (typeof requestIdleCallback === 'function') return requestIdleCallback(cb, opts);
        } catch (e) {}
        return setTimeout(cb, 1);
    };

    // ===== HTML 转义 =====
    U.escHtml = function (s) {
        if (s == null) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };

    // ===== 数组去重 =====
    U.uniq = function (arr) {
        var seen = {}, out = [];
        for (var i = 0; i < arr.length; i++) {
            if (!seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); }
        }
        return out;
    };

    // ===== 安全 JSON =====
    U.safeJson = function (s, def) {
        try { return JSON.parse(s); } catch (e) { return def; }
    };

    // ===== 日期格式化 =====
    U.dateStr = function () {
        var d = new Date();
        function pad(n) { return n < 10 ? '0' + n : '' + n; }
        return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    };

    // ===== 字节大小显示 =====
    U.formatSize = function (b) {
        if (b == null || b < 0) return '';
        if (b < 1024) return b + ' B';
        if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
        if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
        return (b / 1073741824).toFixed(2) + ' GB';
    };

    // ===== 时间格式化（秒 → HH:MM:SS）=====
    U.formatTime = function (sec) {
        if (!U.isNum(sec) || sec < 0) return '00:00';
        var h = Math.floor(sec / 3600);
        var m = Math.floor((sec % 3600) / 60);
        var s = Math.floor(sec % 60);
        function pad(n) { return n < 10 ? '0' + n : n; }
        if (h > 0) return pad(h) + ':' + pad(m) + ':' + pad(s);
        return pad(m) + ':' + pad(s);
    };

    // ===== 字符串截断 =====
    U.trunc = function (s, n) {
        if (!U.isStr(s)) return '';
        if (s.length <= n) return s;
        return s.substring(0, n - 1) + '…';
    };

    // ===== 域名 =====
    U.getHost = function () {
        try { return (location.hostname || '').replace(/\./g, '-') || 'site'; } catch (e) { return 'site'; }
    };

    // ===== 移动端检测 =====
    U.isMobile = function () {
        try { return /Mobi|Android|iPhone|iPad|HarmonyOS/i.test(navigator.userAgent) || window.innerWidth < 700; } catch (e) { return false; }
    };

    // ===== 生成随机颜色 =====
    U.randColor = function () {
        return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    };

    // ===== 深拷贝 =====
    U.deepClone = function (obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (U.isArr(obj)) return obj.map(function (v) { return U.deepClone(v); });
        var out = {};
        for (var k in obj) if (obj.hasOwnProperty(k)) out[k] = U.deepClone(obj[k]);
        return out;
    };

    // ===== 数组分组 =====
    U.chunk = function (arr, size) {
        var out = [];
        for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
    };

    // ===== Base64 编解码 =====
    U.b64Encode = function (str) {
        try {
            if (typeof TextEncoder !== 'undefined') {
                var bytes = new TextEncoder('utf-8').encode(String(str));
                var bin = '';
                for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
                return btoa(bin);
            }
            return btoa(unescape(encodeURIComponent(str)));
        } catch (e) { return ''; }
    };
    U.b64Decode = function (b64) {
        try {
            if (typeof TextDecoder !== 'undefined') {
                var bin = atob(String(b64));
                var bytes = new Uint8Array(bin.length);
                for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                return new TextDecoder('utf-8').decode(bytes);
            }
            return decodeURIComponent(escape(atob(b64)));
        } catch (e) { return ''; }
    };

    // =========================================================================

    // =========================================================================
    // 🌍 模块 1b：国际化系统 (i18n)
    // =========================================================================
    var LANG = {};
    LANG.strings = {
        'zh-CN': {
            'scan': '扫描',
            'rescan': '重新扫描',
            'img': '图片',
            'video': '视频',
            'audio': '音频',
            'm3u8': '流媒体',
            'translate': '翻译',
            'cookie': 'Cookie',
            'storage': '存储',
            'settings': '设置',
            'domain': '域名',
            'close': '关闭',
            'download': '下载',
            'downloadAll': '下载全部',
            'downloadSel': '下载选中',
            'copyUrl': '复制链接',
            'copyAllUrl': '复制全部链接',
            'copySelUrl': '复制选中链接',
            'openTab': '新标签打开',
            'preview': '预览',
            'search': '搜索...',
            'filter': '筛选',
            'filterSize': '文件大小筛选',
            'minSize': '最小大小 (KB)',
            'maxSize': '最大大小 (KB, 0=不限)',
            'applyFilter': '应用筛选',
            'resetFilter': '重置筛选',
            'totalItems': '共',
            'items': '项',
            'showing': '显示 {shown} / {total} 项',
            'found': '找到',
            'selected': '已选',
            'selectAll': '全选',
            'deselectAll': '取消全选',
            'noMedia': '暂无资源',
            'lang': '界面语言',
            'theme': '主题',
            'system': '跟随系统',
            'light': '亮色',
            'dark': '暗色',
            'autoMerge': '自动合并分片',
            'autoThumb': '自动提取视频封面',
            'autoThumbDesc': '自动尝试加载视频首帧作为缩略图',
            'enabled': '✅ 已启用',
            'disabled': '○ 已禁用',
            'domainRules': '自定义域名规则',
            'domainRulesDesc': '为特定域名设置扫描策略（一行一条：域名,图片扫描,视频扫描,音频扫描,深度，例如: baidu.com,1,0,0,1）',
            'clearCache': '清除缓存',
            'saved': '已保存',
            'ok': '成功',
            'fail': '失败',
            'loading': '加载中...',
            'confirm': '确认',
            'cancel': '取消',
            'size': '大小',
            'duration': '时长',
            'url': '链接',
            'name': '名称',
            'hint': '普通点击=预览 · 双击=下载 · Shift+点击=多选',
            'langSelect': '界面语言', 'themeSelect': '界面主题',
            'themeAuto': '跟随系统', 'themeLight': '☀ 亮色', 'themeDark': '🌙 暗色',
            'nameTpl': '下载文件名模板', 'saveRules': '保存域名规则',
            'rulesSaved': '已保存 {n} 条域名规则',
            'coverExtracted': '✅ 封面已提取并下载',
            'coverFail': '封面提取失败', 'coverWait': '正在提取封面，请稍候...',
            'loadingMeta': '加载中...',
            'copied': '已复制', 'noFiles': '无下载文件',
            'noSelected': '未选择文件', 'startDl': '开始下载...',
            'done': '完成', 'stopped': '已停止', 'scanning': '正在扫描...',
            'scanDone': '扫描完成', 'filterApplied': '筛选已应用',
            'appTitle': '媒体嗅探器 Pro',
            'tabImg': '🖼 图片', 'tabVideo': '🎬 视频', 'tabAudio': '🎵 音频',
            'tabM3u8': '📺 流媒体', 'tabTranslate': '📖 翻译',
            'tabCookie': '🍪 Cookie', 'tabStorage': '💾 存储',
            'tabSettings': '⚙️ 设置',
            'btnSelAll': '全选', 'btnSelNone': '取消全选',
            'extractCover': '提取封面', 'filterPanel': '筛选设置',
            'advFilterTitle': '🔧 高级筛选设置',
            'advFilterDesc': '设置阈值后，点击"应用筛选"重新过滤资源列表',
            'minImageSize': '最小图片大小（字节）',
            'minImageWidth': '最小图片宽度（px）',
            'minVideoDuration': '最小视频时长（秒）',
            'applyFilterBtn': '应用筛选',
            'filterNoMatch': '筛选后无匹配结果',
            'minKb': '最小大小 (KB)', 'maxKb': '最大大小 (KB, 0=不限)',
            'apply': '应用', 'reset': '重置'
        ,
            'searchPlaceholder': '搜索...',
            'advFilter': '高级筛选',
            'noCookie': '暂无 Cookie',
            'copyCookieStr': '📋 复制 Cookie 字符串',
            'copyJson': '📋 复制 JSON',
            'addCookie': '➕ 新增 Cookie',
            'clearSite': '🗑 清空本站',
            'delete': '删除',
            'cookieName': 'Cookie 名称',
            'cookieValue': '请输入 Cookie 值：',
            'confirmClearCookie': '确认清空本站 Cookie？',
            'clearedRefresh': '已清空，请刷新页面',
            'added': '已添加',
            'addFail': '添加失败',
            'delFail': '删除失败',
            'clearFail': '清空失败',
            'readCookieFail': '读取 Cookie 失败',
            'exportLs': '📤 导出 localStorage',
            'exportSs': '📤 导出 sessionStorage',
            'addItem': '➕ 新增项',
            'clearAll': '🗑 清空全部',
            'keyName': '键名',
            'keyValue': '键值',
            'confirmClearStorage': '确认清空存储？',
            'cleared': '已清空',
            'addToLs': '添加到 localStorage',
            'lsTitle': '📦 localStorage',
            'ssTitle': '💾 sessionStorage',
            'lsCount': '📦 localStorage {n} 条 · 💾 sessionStorage {m} 条',
            'transTitle': '📖 翻译工具',
            'transIntro': '· 使用 MyMemory 免费 API（国内可用）· 一次最多 500 字符<br/>· 快捷键 Alt+T 翻译当前页选中文字',
            'transInputPh': '请输入要翻译的文本...',
            'transResultPh': '翻译结果将显示在这里',
            'transBtn': '翻译',
            'zhToEn': '中→英',
            'enToZh': '英→中',
            'clearBtn': '清空',
            'copyResult': '📋 复制结果',
            'resultAsInput': '🔁 结果当输入',
            'plsInputText': '请输入文本',
            'translating': '⏳ 正在翻译（{from} → {to}）…',
            'translatingShort': '正在翻译...',
            'transDone': '✅ 翻译完成 · ',
            'transFail': '❌ 翻译失败',
            'transFailShort': '（翻译失败）',
            'autoDetect': '自动检测',
            'zhLang': '中文',
            'enLang': '英语',
            'jaLang': '日语',
            'koLang': '韩语',
            'frLang': '法语',
            'deLang': '德语',
            'esLang': '西语',
            'ruLang': '俄语',
            'selInfo': '已选 {sel} / {shown}（共 {total}）',
            'selectAllBtn': '全选',
            'invertSel': '反选',
            'clearSel': '清除选择',
            'copySelBtn': '复制选中',
            'downloadSelBtn': '下载选中',
            'copyN': '复制({n})',
            'downloadN': '下载({n})',
            'genScript': '生成下载脚本',
            'plsCheck': '请至少选择一项',
            'scriptCopied': '脚本已复制到剪贴板',
            'rescanDone': '重新扫描完成',
            'copiedN': '✅ 已复制 {n} 字符',
            'copyFail': '复制失败',
            'noDlResource': '无下载资源',
            'downloading': '下载中...',
            'batchStart': '⬇ 开始批量下载 {n} 项（并发 {c}）',
            'batchDone': '✅ 批量下载完成：成功 {ok} / {total}，失败 {fail}，耗时 {t}秒',
            'dlStopped': '下载已停止',
            'scanDoneToast': '扫描完成',
            'filterAppliedToast': '筛选已应用',
            'noSelFile': '未选择文件',
            'startDlToast': '开始下载 {n} 个文件...',
            'noDlFile': '无下载文件',
            'noCopyUrl': '无链接可复制',
            'm3u8Start': '开始处理 m3u8',
            'm3u8Progress': '下载进度: {d}/{t}',
            'm3u8Fail': '❌ 下载失败',
            'm3u8Done': 'm3u8 下载完成',
            'previewFail': '预览失败',
            'extractFail': '提取失败',
            'logLevelChanged': '日志级别已更改',
            'resetDone': '已重置为默认配置',
            'plsSelectText': '请选择文本',
            'transSelText': '翻译选中文本',
            'confirmDlSel': '开始下载 {n} 个文件？（同时下载可能会阻塞页面）',
            'confirmDlAll': '开始下载 {n} 个文件？',
            'confirmReset': '确认重置所有配置？',
            'pasteJson': '粘贴 JSON 配置',
            'm3u8Title': '📺 流媒体：{n} 个 m3u8',
            'noM3u8': '暂无 m3u8 资源',
            'dlMerge': '下载并合并',
            'genScriptBtn': '生成脚本',
            'detailBtn': '详情',
            'm3u8Detail': '📺 m3u8 流媒体详情',
            'parsing': '解析中...',
            'parseResult': '解析结果：{n} 个分片',
            'masterStreams': '多码率流，共 {n} 个子流：',
            'segmentsInfo': '分片列表，共 {n} 个分片，总时长 {t}',
            'encrypted': '🔐 AES 加密',
            'notEncrypted': '🔓 未加密',
            'yes': '是',
            'no': '否',
            'parseFailNet': '网络请求失败',
            'parseFailTimeout': '请求超时',
            'm3u8PreviewHint': 'm3u8 不可直接预览，请下载',
            'logLevelTitle': '📊 日志级别（调试用）',
            'logDebug': '调试',
            'logInfo': '信息',
            'logWarn': '警告',
            'logError': '错误',
            'otherOps': '🎨 其他操作',
            'exportAllConfig': '📤 导出全部配置',
            'importConfig': '📥 导入配置',
            'resetAll': '↺ 重置全部设置',
            'batchTitle': '📦 批量下载设置',
            'concurrency': '并发数：',
            'intervalMs': '间隔(ms)：',
            'retries': '重试次数：',
            'm3u8Settings': 'm3u8 流媒体设置',
            'qualityLabel': '默认码率：',
            'segmentsLabel': '分片并发：',
            'qualityAuto': '自动选择',
            'qualityHigh': '最高清晰度',
            'qualityMedium': '中等清晰度',
            'qualityLow': '最低清晰度',
            'requestHeaders': '🔧 请求头设置',
            'referer': 'Referer:',
            'userAgent': 'User-Agent:',
            'cookie': 'Cookie:',
            'infoLine1': '媒体嗅探器 Pro v8.6.0 · 模块化架构 · AES-128 解密 · 虚拟列表 · 进度可视化',
            'infoLine2': '快捷键：Alt+T 翻译选中 · Alt+B 开关面板 · Esc 关闭',
            'clickTabScan': '点击标签扫描',
            'dlProgress': '下载进度',
            'dlProgressText': '{done} / {total}（失败 {fail}）· {speed} · 预计剩余 {eta}',
            },
        'en-US': {
            'scan': 'Scan', 'rescan': 'Rescan', 'img': 'Images',
            'video': 'Videos', 'audio': 'Audio', 'm3u8': 'Streams',
            'translate': 'Translate', 'cookie': 'Cookies', 'storage': 'Storage',
            'settings': 'Settings', 'domain': 'Domain', 'close': 'Close',
            'download': 'Download', 'downloadAll': 'Download All',
            'downloadSel': 'Download Selected', 'copyUrl': 'Copy URL',
            'copyAllUrl': 'Copy All URLs', 'copySelUrl': 'Copy Selected URLs',
            'openTab': 'Open in New Tab', 'preview': 'Preview',
            'search': 'Search...', 'filter': 'Filter', 'filterSize': 'Size Filter',
            'minSize': 'Min Size (KB)', 'maxSize': 'Max Size (KB, 0=unlimited)',
            'applyFilter': 'Apply', 'resetFilter': 'Reset',
            'totalItems': 'Total:', 'items': 'items', 'showing': 'Showing {shown} / {total} items',
            'found': 'Found', 'selected': 'selected', 'selectAll': 'Select All',
            'deselectAll': 'Deselect All', 'noMedia': 'No resources yet',
            'lang': 'UI Language', 'theme': 'Theme', 'system': 'System',
            'light': 'Light', 'dark': 'Dark', 'autoMerge': 'Auto Merge',
            'autoThumb': 'Extract Video Thumbnails', 'autoThumbDesc': 'Auto load first video frame as thumbnail',
            'enabled': '✅ Enabled', 'disabled': '○ Disabled',
            'domainRules': 'Domain Rules',
            'domainRulesDesc': 'One per line: domain,img,video,audio,depth (e.g. baidu.com,1,0,0,1)',
            'clearCache': 'Clear Cache', 'saved': 'Saved', 'ok': 'OK',
            'fail': 'Failed', 'loading': 'Loading...',
            'confirm': 'Confirm', 'cancel': 'Cancel', 'size': 'Size',
            'duration': 'Duration', 'url': 'URL', 'name': 'Name',
            'hint': 'Click=Preview · Double-click=Download · Shift+click=Multi-select',
            'langSelect': 'UI Language', 'themeSelect': 'UI Theme',
            'themeAuto': 'System', 'themeLight': '☀ Light', 'themeDark': '🌙 Dark',
            'nameTpl': 'Download Filename Template', 'saveRules': 'Save Domain Rules',
            'rulesSaved': 'Saved {n} domain rules',
            'coverExtracted': '✅ Cover extracted',
            'coverFail': 'Cover extraction failed', 'coverWait': 'Extracting cover...',
            'loadingMeta': 'Loading...',
            'copied': 'Copied', 'noFiles': 'No downloadable files',
            'noSelected': 'No files selected', 'startDl': 'Starting download...',
            'done': 'Done', 'stopped': 'Stopped', 'scanning': 'Scanning...',
            'scanDone': 'Scan complete', 'filterApplied': 'Filter applied',
            'appTitle': 'Media Sniffer Pro',
            'tabImg': '🖼 Images', 'tabVideo': '🎬 Videos', 'tabAudio': '🎵 Audio',
            'tabM3u8': '📺 Streams', 'tabTranslate': '📖 Translate',
            'tabCookie': '🍪 Cookies', 'tabStorage': '💾 Storage',
            'tabSettings': '⚙️ Settings',
            'btnSelAll': 'Select All', 'btnSelNone': 'Deselect All',
            'extractCover': 'Extract Cover', 'filterPanel': 'Filter Settings',
            'advFilterTitle': '🔧 Advanced Filter Settings',
            'advFilterDesc': 'Set thresholds, then click "Apply" to re-filter the resource list',
            'minImageSize': 'Min Image Size (bytes)',
            'minImageWidth': 'Min Image Width (px)',
            'minVideoDuration': 'Min Video Duration (sec)',
            'applyFilterBtn': 'Apply Filter',
            'filterNoMatch': 'No matches after filter',
            'minKb': 'Min Size (KB)', 'maxKb': 'Max Size (KB, 0=unlimited)',
            'apply': 'Apply', 'reset': 'Reset'
        ,
            'searchPlaceholder': '🔍 Search URL or filename…',
            'advFilter': '🔧 Advanced Filter',
            'noCookie': 'No cookies on this page',
            'copyCookieStr': '📋 Copy Cookie String',
            'copyJson': '📋 Copy JSON',
            'addCookie': '➕ Add Cookie',
            'clearSite': '🗑 Clear Site',
            'delete': 'Delete',
            'cookieName': 'Enter cookie name:',
            'cookieValue': 'Enter cookie value:',
            'confirmClearCookie': 'Clear all cookies for this site?',
            'clearedRefresh': '✅ Cleared, please refresh',
            'added': '✅ Added',
            'addFail': 'Add failed',
            'delFail': 'Delete failed',
            'clearFail': 'Clear failed',
            'readCookieFail': 'Cannot read cookies',
            'exportLs': '📤 Export localStorage',
            'exportSs': '📤 Export sessionStorage',
            'addItem': '➕ Add Item',
            'clearAll': '🗑 Clear All',
            'keyName': 'Key:',
            'keyValue': 'Value:',
            'confirmClearStorage': 'Clear localStorage and sessionStorage?',
            'cleared': '✅ Cleared',
            'addToLs': '✅ Added to localStorage',
            'lsTitle': '📦 localStorage',
            'ssTitle': '💾 sessionStorage',
            'lsCount': '📦 localStorage {n} · 💾 sessionStorage {m}',
            'transTitle': '🌐 Text Translation',
            'transIntro': '· MyMemory free API · Max 500 chars<br/>· Shortcut: Alt+T to translate selected text',
            'transInputPh': 'Enter or paste text to translate…',
            'transResultPh': 'Translation result appears here…',
            'transBtn': 'Translate',
            'zhToEn': 'ZH→EN',
            'enToZh': 'EN→ZH',
            'clearBtn': 'Clear',
            'copyResult': '📋 Copy Result',
            'resultAsInput': '🔁 Use as Input',
            'plsInputText': '⚠ Please enter text to translate',
            'translating': '⏳ Translating ({from} → {to})…',
            'translatingShort': '⏳ Translating, please wait…',
            'transDone': '✅ Translated · ',
            'transFail': '❌ Translation failed',
            'transFailShort': '(failed)',
            'autoDetect': 'Auto Detect',
            'zhLang': 'Chinese',
            'enLang': 'English',
            'jaLang': 'Japanese',
            'koLang': 'Korean',
            'frLang': 'French',
            'deLang': 'German',
            'esLang': 'Spanish',
            'ruLang': 'Russian',
            'selInfo': '{sel} selected / {shown} shown ({total} total)',
            'selectAllBtn': 'Select All',
            'invertSel': 'Invert',
            'clearSel': 'Clear',
            'copySelBtn': 'Copy',
            'downloadSelBtn': '⬇ Download',
            'copyN': 'Copy ({n})',
            'downloadN': 'Download ({n})',
            'genScript': '📝 Generate Script',
            'rescan': '🔄 Rescan',
            'plsCheck': 'Please select resources first',
            'scriptCopied': '✅ aria2 script generated and copied',
            'rescanDone': '✅ Rescanned',
            'copiedN': '✅ Copied {n} chars',
            'copyFail': 'Copy failed',
            'noDlResource': 'No downloadable resources',
            'downloading': '⏳ Download already in progress',
            'batchStart': '⬇ Starting batch download of {n} items ({c} concurrent)',
            'batchDone': '✅ Batch done: {ok}/{total} success, {fail} failed, {t}s',
            'dlStopped': '⏹ Download stopped',
            'scanDoneToast': '✅ Scan complete',
            'filterAppliedToast': '✅ Filter applied',
            'noSelFile': 'No files selected',
            'startDlToast': 'Starting download of {n} files...',
            'noDlFile': 'No downloadable files',
            'noCopyUrl': 'No URLs to copy',
            'm3u8Start': '⏳ Starting m3u8 download...',
            'm3u8Progress': 'Progress: {d}/{t}',
            'm3u8Fail': '❌ Download failed',
            'm3u8Done': '✅ m3u8 merged and downloaded',
            'previewFail': 'Preview failed',
            'extractFail': 'Extraction failed',
            'logLevelChanged': '✅ Log level changed',
            'resetDone': '✅ Reset',
            'plsSelectText': 'Please select text to translate first',
            'transSelText': '🌐 Translate Selection',
            'confirmDlSel': 'Download {n} selected files? (may block the page)',
            'confirmDlAll': 'Download all {n} files?',
            'confirmReset': 'Reset all settings?',
            'pasteJson': 'Paste config JSON:',
            'm3u8Title': '📺 Streams: {n} m3u8',
            'noM3u8': 'No m3u8 streams found',
            'dlMerge': '⬇ Download & Merge',
            'genScriptBtn': '📝 Generate Script',
            'detailBtn': '👁 Details',
            'm3u8Detail': '📺 m3u8 Stream Details',
            'parsing': 'Parsing...',
            'parseResult': 'Parse result:',
            'masterStreams': 'Master playlist, {n} variants:',
            'segmentsInfo': '{n} segments, total duration {t}',
            'encrypted': 'Encrypted',
            'notEncrypted': 'Not encrypted',
            'yes': 'Yes',
            'no': 'No',
            'parseFailNet': 'Parse failed: network error',
            'parseFailTimeout': 'Parse failed: timeout',
            'm3u8PreviewHint': 'Stream (m3u8): use download function',
            'logLevelTitle': '📊 Log Level (debug)',
            'logDebug': 'DEBUG (verbose)',
            'logInfo': 'INFO (default)',
            'logWarn': 'WARN',
            'logError': 'ERROR (errors only)',
            'otherOps': '🎨 Other Actions',
            'exportAllConfig': '📤 Export All Config',
            'importConfig': '📥 Import Config',
            'resetAll': '↺ Reset All Settings',
            'batchTitle': '📦 Batch Download Settings',
            'concurrency': 'Concurrency:',
            'intervalMs': 'Interval (ms):',
            'retries': 'Retries:',
            'm3u8Settings': 'm3u8 Stream Settings',
            'qualityLabel': 'Quality:',
            'segmentsLabel': 'Segments:',
            'qualityAuto': 'Auto',
            'qualityHigh': 'Best Quality',
            'qualityMedium': 'Medium',
            'qualityLow': 'Low',
            'requestHeaders': '🔧 Request Headers',
            'referer': 'Referer:',
            'userAgent': 'User-Agent:',
            'cookie': 'Cookie:',
            'infoLine1': 'Media Sniffer Pro v8 · Modular · AES-128 · Virtual List · Progress',
            'infoLine2': 'Shortcuts: Alt+T Translate · Alt+B Toggle · Esc Close',
            'clickTabScan': 'Click a tab above to start scanning',
            'dlProgress': 'Download Progress',
            'dlProgressText': '{done} / {total} ({fail} failed) · {speed} · ETA {eta}',
            },
        'ja-JP': {
            'scan': 'スキャン', 'rescan': '再スキャン', 'img': '画像',
            'video': '動画', 'audio': '音声', 'm3u8': 'ストリーム',
            'translate': '翻訳', 'cookie': 'Cookie', 'storage': 'ストレージ',
            'settings': '設定', 'domain': 'ドメイン', 'close': '閉じる',
            'download': 'ダウンロード', 'downloadAll': '一括ダウンロード',
            'downloadSel': '選択した項目をダウンロード', 'copyUrl': 'リンクをコピー',
            'copyAllUrl': '全リンクをコピー', 'copySelUrl': '選択したリンクをコピー',
            'openTab': '新しいタブで開く', 'preview': 'プレビュー',
            'search': '検索...', 'filter': 'フィルター', 'filterSize': 'サイズフィルター',
            'minSize': '最小サイズ (KB)', 'maxSize': '最大サイズ (KB, 0=制限なし)',
            'applyFilter': '適用', 'resetFilter': 'リセット',
            'totalItems': '合計:', 'items': '項目', 'showing': '{shown} / {total} 件を表示中',
            'found': '見つかりました', 'selected': '選択済み',
            'selectAll': 'すべて選択', 'deselectAll': '選択解除',
            'noMedia': 'リソースはありません', 'lang': '言語',
            'theme': 'テーマ', 'system': 'システムに従う', 'light': 'ライト',
            'dark': 'ダーク', 'autoMerge': '自動結合', 'autoThumb': '動画サムネイル抽出',
            'autoThumbDesc': '動画フレームをサムネイルとして自動読み込み',
            'enabled': '✅ 有効', 'disabled': '○ 無効',
            'domainRules': 'ドメインルール', 'domainRulesDesc': '1行1ルール: ドメイン,画像,動画,音声,深度 (例: baidu.com,1,0,0,1)',
            'clearCache': 'キャッシュをクリア', 'saved': '保存しました', 'ok': 'OK',
            'fail': '失敗', 'loading': '読み込み中...', 'confirm': '確認',
            'cancel': 'キャンセル', 'size': 'サイズ', 'duration': '長さ',
            'url': 'URL', 'name': '名前', 'hint': 'クリック=プレビュー · ダブルクリック=ダウンロード',
            'langSelect': 'UI言語', 'themeSelect': 'UIテーマ',
            'themeAuto': 'システム', 'themeLight': '☀ ライト', 'themeDark': '🌙 ダーク',
            'nameTpl': 'ダウンロードファイル名テンプレート', 'saveRules': 'ドメインルールを保存',
            'rulesSaved': '{n} 件のルールを保存しました',
            'coverExtracted': '✅ カバーを抽出しました',
            'coverFail': 'カバー抽出に失敗しました', 'coverWait': 'カバー抽出中...',
            'loadingMeta': '読み込み中...',
            'copied': 'コピーしました', 'noFiles': 'ダウンロード可能なファイルはありません',
            'noSelected': 'ファイルが選択されていません', 'startDl': 'ダウンロード開始...',
            'done': '完了', 'stopped': '停止しました', 'scanning': 'スキャン中...',
            'scanDone': 'スキャン完了', 'filterApplied': 'フィルターを適用しました',
            'appTitle': 'メディアスニッファー Pro',
            'tabImg': '🖼 画像', 'tabVideo': '🎬 動画', 'tabAudio': '🎵 音声',
            'tabM3u8': '📺 ストリーム', 'tabTranslate': '📖 翻訳',
            'tabCookie': '🍪 Cookie', 'tabStorage': '💾 ストレージ',
            'tabSettings': '⚙️ 設定',
            'btnSelAll': 'すべて選択', 'btnSelNone': '選択解除',
            'extractCover': 'カバー抽出', 'filterPanel': 'フィルター設定',
            'advFilterTitle': '🔧 詳細フィルター設定',
            'advFilterDesc': 'しきい値を設定し、「適用」をクリックしてリストを再フィルター',
            'minImageSize': '最小画像サイズ（バイト）',
            'minImageWidth': '最小画像幅（px）',
            'minVideoDuration': '最小動画長（秒）',
            'applyFilterBtn': 'フィルター適用',
            'filterNoMatch': 'フィルターに一致する項目はありません',
            'minKb': '最小サイズ (KB)', 'maxKb': '最大サイズ (KB, 0=制限なし)',
            'apply': '適用', 'reset': 'リセット'
        ,
            'searchPlaceholder': '🔍 URLまたはファイル名を検索…',
            'advFilter': '🔧 詳細フィルター',
            'noCookie': 'このページにCookieはありません',
            'copyCookieStr': '📋 Cookie文字列コピー',
            'copyJson': '📋 JSONコピー',
            'addCookie': '➕ Cookie追加',
            'clearSite': '🗑 サイトをクリア',
            'delete': '削除',
            'cookieName': 'Cookie名を入力：',
            'cookieValue': 'Cookie値を入力：',
            'confirmClearCookie': 'このサイトのCookieをすべて削除しますか？',
            'clearedRefresh': '✅ クリアしました、更新してください',
            'added': '✅ 追加しました',
            'addFail': '追加失敗',
            'delFail': '削除失敗',
            'clearFail': 'クリア失敗',
            'readCookieFail': 'Cookieを読み込めません',
            'exportLs': '📤 localStorageをエクスポート',
            'exportSs': '📤 sessionStorageをエクスポート',
            'addItem': '➕ 項目を追加',
            'clearAll': '🗑 すべてクリア',
            'keyName': 'キー：',
            'keyValue': '値：',
            'confirmClearStorage': 'localStorageとsessionStorageをクリアしますか？',
            'cleared': '✅ クリアしました',
            'addToLs': '✅ localStorageに追加しました',
            'lsTitle': '📦 localStorage',
            'ssTitle': '💾 sessionStorage',
            'lsCount': '📦 localStorage {n}件 · 💾 sessionStorage {m}件',
            'transTitle': '🌐 テキスト翻訳',
            'transIntro': '・MyMemory無料API ・最大500文字<br/>・ショートカット: Alt+Tで選択テキスト翻訳',
            'transInputPh': '翻訳するテキストを入力または貼り付け…',
            'transResultPh': '翻訳結果がここに表示されます…',
            'transBtn': '翻訳',
            'zhToEn': '中→英',
            'enToZh': '英→中',
            'clearBtn': 'クリア',
            'copyResult': '📋 結果をコピー',
            'resultAsInput': '🔁 結果を入力に',
            'plsInputText': '⚠ 翻訳するテキストを入力してください',
            'translating': '⏳ 翻訳中（{from} → {to}）…',
            'translatingShort': '⏳ 翻訳中、しばらくお待ちください…',
            'transDone': '✅ 翻訳完了 · ',
            'transFail': '❌ 翻訳失敗',
            'transFailShort': '（失敗）',
            'autoDetect': '自動検出',
            'zhLang': '中国語',
            'enLang': '英語',
            'jaLang': '日本語',
            'koLang': '韓国語',
            'frLang': 'フランス語',
            'deLang': 'ドイツ語',
            'esLang': 'スペイン語',
            'ruLang': 'ロシア語',
            'selInfo': '{sel}件選択 / {shown}件表示（全{total}件）',
            'selectAllBtn': 'すべて選択',
            'invertSel': '反転',
            'clearSel': 'クリア',
            'copySelBtn': 'コピー',
            'downloadSelBtn': '⬇ ダウンロード',
            'copyN': 'コピー({n})',
            'downloadN': 'ダウンロード({n})',
            'genScript': '📝 スクリプト生成',
            'rescan': '🔄 再スキャン',
            'plsCheck': 'リソースを選択してください',
            'scriptCopied': '✅ aria2スクリプト生成・コピー完了',
            'rescanDone': '✅ 再スキャン完了',
            'copiedN': '✅ {n}文字コピーしました',
            'copyFail': 'コピー失敗',
            'noDlResource': 'ダウンロード可能なリソースはありません',
            'downloading': '⏳ ダウンロード中です',
            'batchStart': '⬇ 一括DL開始：{n}件（同時{c}件）',
            'batchDone': '✅ 一括DL完了：成功{ok}/{total}件、失敗{fail}件、{t}秒',
            'dlStopped': '⏹ DL停止しました',
            'scanDoneToast': '✅ スキャン完了',
            'filterAppliedToast': '✅ フィルター適用済み',
            'noSelFile': 'ファイルが選択されていません',
            'startDlToast': '{n}ファイルのDLを開始...',
            'noDlFile': 'ダウンロード可能なファイルはありません',
            'noCopyUrl': 'コピーするURLはありません',
            'm3u8Start': '⏳ m3u8のDLを開始...',
            'm3u8Progress': '進捗: {d}/{t}',
            'm3u8Fail': '❌ DL失敗',
            'm3u8Done': '✅ m3u8 結合・DL完了',
            'previewFail': 'プレビュー失敗',
            'extractFail': '抽出失敗',
            'logLevelChanged': '✅ ログレベル変更',
            'resetDone': '✅ リセット完了',
            'plsSelectText': '翻訳するテキストを選択してください',
            'transSelText': '🌐 選択を翻訳',
            'confirmDlSel': '{n}ファイルをDLしますか？（ページが固まる場合があります）',
            'confirmDlAll': '全{n}ファイルをDLしますか？',
            'confirmReset': 'すべての設定をリセットしますか？',
            'pasteJson': '設定JSONを貼り付け：',
            'm3u8Title': '📺 ストリーム：{n} m3u8',
            'noM3u8': 'm3u8ストリームはありません',
            'dlMerge': '⬇ DLして結合',
            'genScriptBtn': '📝 スクリプト生成',
            'detailBtn': '👁 詳細',
            'm3u8Detail': '📺 m3u8ストリーム詳細',
            'parsing': '解析中...',
            'parseResult': '解析結果：',
            'masterStreams': 'マスタープレイリスト、{n}ストリーム：',
            'segmentsInfo': '{n}セグメント、合計時間 {t}',
            'encrypted': '暗号化',
            'notEncrypted': '暗号化なし',
            'yes': 'はい',
            'no': 'いいえ',
            'parseFailNet': '解析失敗：ネットワークエラー',
            'parseFailTimeout': '解析失敗：タイムアウト',
            'm3u8PreviewHint': 'ストリーム (m3u8)：ダウンロード機能を使ってください',
            'logLevelTitle': '📊 ログレベル（デバッグ用）',
            'logDebug': 'DEBUG（詳細）',
            'logInfo': 'INFO（デフォルト）',
            'logWarn': 'WARN（警告）',
            'logError': 'ERROR（エラーのみ）',
            'otherOps': '🎨 その他の操作',
            'exportAllConfig': '📤 全設定エクスポート',
            'importConfig': '📥 設定インポート',
            'resetAll': '↺ 全設定リセット',
            'batchTitle': '📦 一括DL設定',
            'concurrency': '同時実行数:',
            'intervalMs': '間隔(ms):',
            'retries': 'リトライ:',
            'm3u8Settings': 'm3u8ストリーム設定',
            'qualityLabel': '品質:',
            'segmentsLabel': 'セグメント:',
            'qualityAuto': '自動',
            'qualityHigh': '最高',
            'qualityMedium': '中',
            'qualityLow': '低',
            'requestHeaders': '🔧 リクエストヘッダー',
            'referer': 'Referer:',
            'userAgent': 'User-Agent:',
            'cookie': 'Cookie:',
            'infoLine1': 'メディアスニッファー Pro v8 · モジュール設計 · AES-128復号 · 仮想リスト · 進捗可視化',
            'infoLine2': 'ショートカット: Alt+T 翻訳 · Alt+B パネル切替 · Esc 閉じる',
            'clickTabScan': '上のタブをクリックしてスキャン開始',
            'dlProgress': 'ダウンロード進捗',
            'dlProgressText': '{done} / {total}（失敗 {fail}）· {speed} · 残り {eta}',
            },
        'ko-KR': {
            'scan': '스캔', 'rescan': '재스캔', 'img': '이미지',
            'video': '영상', 'audio': '오디오', 'm3u8': '스트림',
            'translate': '번역', 'cookie': '쿠키', 'storage': '저장소',
            'settings': '설정', 'domain': '도메인', 'close': '닫기',
            'download': '다운로드', 'downloadAll': '전체 다운로드',
            'downloadSel': '선택 다운로드', 'copyUrl': '링크 복사',
            'copyAllUrl': '전체 링크 복사', 'copySelUrl': '선택 링크 복사',
            'openTab': '새 탭에서 열기', 'preview': '미리보기',
            'search': '검색...', 'filter': '필터', 'filterSize': '크기 필터',
            'minSize': '최소 크기 (KB)', 'maxSize': '최대 크기 (KB, 0=제한없음)',
            'applyFilter': '적용', 'resetFilter': '재설정',
            'totalItems': '총:', 'items': '개', 'showing': '{shown} / {total} 항목 표시 중',
            'found': '발견', 'selected': '선택됨',
            'selectAll': '전체 선택', 'deselectAll': '선택 해제',
            'noMedia': '리소스 없음', 'lang': '언어',
            'theme': '테마', 'system': '시스템 설정', 'light': '라이트',
            'dark': '다크', 'autoMerge': '자동 병합', 'autoThumb': '영상 썸네일 추출',
            'autoThumbDesc': '동영상 첫 프레임을 썸네일로',
            'enabled': '✅ 활성', 'disabled': '○ 비활성',
            'domainRules': '도메인 규칙', 'domainRulesDesc': '줄당 1규칙: 도메인,이미지,영상,음성,깊이',
            'clearCache': '캐시 지우기', 'saved': '저장됨', 'ok': 'OK',
            'fail': '실패', 'loading': '로딩 중...', 'confirm': '확인',
            'cancel': '취소', 'size': '크기', 'duration': '길이',
            'url': 'URL', 'name': '이름', 'hint': '클릭=미리보기 · 더블클릭=다운로드',
            'langSelect': 'UI 언어', 'themeSelect': 'UI 테마',
            'themeAuto': '시스템', 'themeLight': '☀ 라이트', 'themeDark': '🌙 다크',
            'nameTpl': '다운로드 파일명 템플릿', 'saveRules': '도메인 규칙 저장',
            'rulesSaved': '{n}개의 규칙이 저장됨',
            'coverExtracted': '✅ 썸네일 추출됨',
            'coverFail': '썸네일 추출 실패', 'coverWait': '썸네일 추출 중...',
            'loadingMeta': '로딩 중...',
            'copied': '복사됨', 'noFiles': '다운로드할 파일 없음',
            'noSelected': '선택된 파일 없음', 'startDl': '다운로드 시작...',
            'done': '완료', 'stopped': '중지됨', 'scanning': '스캔 중...',
            'scanDone': '스캔 완료', 'filterApplied': '필터 적용됨',
            'appTitle': '미디어 스니퍼 Pro',
            'tabImg': '🖼 이미지', 'tabVideo': '🎬 영상', 'tabAudio': '🎵 오디오',
            'tabM3u8': '📺 스트림', 'tabTranslate': '📖 번역',
            'tabCookie': '🍪 쿠키', 'tabStorage': '💾 저장소',
            'tabSettings': '⚙️ 설정',
            'btnSelAll': '전체 선택', 'btnSelNone': '선택 해제',
            'extractCover': '썸네일 추출', 'filterPanel': '필터 설정',
            'advFilterTitle': '🔧 고급 필터 설정',
            'advFilterDesc': '임계값을 설정한 후 "적용"을 클릭하여 리스트를 다시 필터링',
            'minImageSize': '최소 이미지 크기（바이트）',
            'minImageWidth': '최소 이미지 너비（px）',
            'minVideoDuration': '최소 영상 길이（초）',
            'applyFilterBtn': '필터 적용',
            'filterNoMatch': '필터와 일치하는 항목 없음',
            'minKb': '최소 크기 (KB)', 'maxKb': '최대 크기 (KB, 0=제한없음)',
            'apply': '적용', 'reset': '재설정'
        ,
            'searchPlaceholder': '🔍 URL 또는 파일명 검색…',
            'advFilter': '🔧 고급 필터',
            'noCookie': '이 페이지에 쿠키가 없습니다',
            'copyCookieStr': '📋 쿠키 문자열 복사',
            'copyJson': '📋 JSON 복사',
            'addCookie': '➕ 쿠키 추가',
            'clearSite': '🗑 사이트 비우기',
            'delete': '삭제',
            'cookieName': '쿠키 이름을 입력하세요:',
            'cookieValue': '쿠키 값을 입력하세요:',
            'confirmClearCookie': '이 사이트의 모든 쿠키를 지우시겠습니까?',
            'clearedRefresh': '✅ 지워졌습니다, 새로고침하세요',
            'added': '✅ 추가됨',
            'addFail': '추가 실패',
            'delFail': '삭제 실패',
            'clearFail': '비우기 실패',
            'readCookieFail': '쿠키를 읽을 수 없습니다',
            'exportLs': '📤 localStorage 내보내기',
            'exportSs': '📤 sessionStorage 내보내기',
            'addItem': '➕ 항목 추가',
            'clearAll': '🗑 모두 비우기',
            'keyName': '키:',
            'keyValue': '값:',
            'confirmClearStorage': 'localStorage와 sessionStorage를 비우시겠습니까?',
            'cleared': '✅ 비워졌습니다',
            'addToLs': '✅ localStorage에 추가됨',
            'lsTitle': '📦 localStorage',
            'ssTitle': '💾 sessionStorage',
            'lsCount': '📦 localStorage {n}개 · 💾 sessionStorage {m}개',
            'transTitle': '🌐 텍스트 번역',
            'transIntro': '· MyMemory 무료 API · 최대 500자<br/>· 단축키: Alt+T로 선택 텍스트 번역',
            'transInputPh': '번역할 텍스트를 입력하거나 붙여넣으세요…',
            'transResultPh': '번역 결과가 여기에 표시됩니다…',
            'transBtn': '번역',
            'zhToEn': '중→영',
            'enToZh': '영→중',
            'clearBtn': '비우기',
            'copyResult': '📋 결과 복사',
            'resultAsInput': '🔁 결과를 입력으로',
            'plsInputText': '⚠ 번역할 텍스트를 입력하세요',
            'translating': '⏳ 번역 중（{from} → {to}）…',
            'translatingShort': '⏳ 번역 중입니다…',
            'transDone': '✅ 번역 완료 · ',
            'transFail': '❌ 번역 실패',
            'transFailShort': '（실패）',
            'autoDetect': '자동 감지',
            'zhLang': '중국어',
            'enLang': '영어',
            'jaLang': '일본어',
            'koLang': '한국어',
            'frLang': '프랑스어',
            'deLang': '독일어',
            'esLang': '스페인어',
            'ruLang': '러시아어',
            'selInfo': '{sel}개 선택 / {shown}개 표시（총 {total}개）',
            'selectAllBtn': '전체 선택',
            'invertSel': '반전',
            'clearSel': '비우기',
            'copySelBtn': '복사',
            'downloadSelBtn': '⬇ 다운로드',
            'copyN': '복사({n})',
            'downloadN': '다운로드({n})',
            'genScript': '📝 스크립트 생성',
            'rescan': '🔄 재스캔',
            'plsCheck': '리소스를 선택하세요',
            'scriptCopied': '✅ aria2 스크립트 생성 및 복사됨',
            'rescanDone': '✅ 재스캔 완료',
            'copiedN': '✅ {n}자 복사됨',
            'copyFail': '복사 실패',
            'noDlResource': '다운로드 가능한 리소스가 없습니다',
            'downloading': '⏳ 이미 다운로드 중입니다',
            'batchStart': '⬇ 일괄 다운로드 시작: {n}개（동시 {c}개）',
            'batchDone': '✅ 일괄 완료: 성공 {ok}/{total}, 실패 {fail}, {t}초',
            'dlStopped': '⏹ 다운로드 중지됨',
            'scanDoneToast': '✅ 스캔 완료',
            'filterAppliedToast': '✅ 필터 적용됨',
            'noSelFile': '선택된 파일이 없습니다',
            'startDlToast': '{n}개 파일 다운로드 시작...',
            'noDlFile': '다운로드할 파일이 없습니다',
            'noCopyUrl': '복사할 URL이 없습니다',
            'm3u8Start': '⏳ m3u8 다운로드 시작...',
            'm3u8Progress': '진행률: {d}/{t}',
            'm3u8Fail': '❌ 다운로드 실패',
            'm3u8Done': '✅ m3u8 병합 및 다운로드 완료',
            'previewFail': '미리보기 실패',
            'extractFail': '추출 실패',
            'logLevelChanged': '✅ 로그 레벨 변경됨',
            'resetDone': '✅ 재설정됨',
            'plsSelectText': '번역할 텍스트를 먼저 선택하세요',
            'transSelText': '🌐 선택 번역',
            'confirmDlSel': '{n}개 파일을 다운로드하시겠습니까?（페이지가 느려질 수 있습니다）',
            'confirmDlAll': '총 {n}개 파일을 다운로드하시겠습니까?',
            'confirmReset': '모든 설정을 재설정하시겠습니까?',
            'pasteJson': '설정 JSON 붙여넣기:',
            'm3u8Title': '📺 스트림: {n} m3u8',
            'noM3u8': 'm3u8 스트림이 없습니다',
            'dlMerge': '⬇ 다운로드 및 병합',
            'genScriptBtn': '📝 스크립트 생성',
            'detailBtn': '👁 세부정보',
            'm3u8Detail': '📺 m3u8 스트림 세부정보',
            'parsing': '분석 중...',
            'parseResult': '분석 결과:',
            'masterStreams': '마스터 플레이리스트, {n}개 스트림:',
            'segmentsInfo': '{n}개 세그먼트, 총 재생시간 {t}',
            'encrypted': '암호화됨',
            'notEncrypted': '암호화 안됨',
            'yes': '예',
            'no': '아니요',
            'parseFailNet': '분석 실패: 네트워크 오류',
            'parseFailTimeout': '분석 실패: 시간 초과',
            'm3u8PreviewHint': '스트림 (m3u8): 다운로드 기능을 사용하세요',
            'logLevelTitle': '📊 로그 레벨（디버그용）',
            'logDebug': 'DEBUG（상세）',
            'logInfo': 'INFO（기본）',
            'logWarn': 'WARN（경고）',
            'logError': 'ERROR（오류만）',
            'otherOps': '🎨 기타 작업',
            'exportAllConfig': '📤 전체 설정 내보내기',
            'importConfig': '📥 설정 가져오기',
            'resetAll': '↺ 모든 설정 재설정',
            'batchTitle': '📦 일괄 다운로드 설정',
            'concurrency': '동시 실행:',
            'intervalMs': '간격(ms):',
            'retries': '재시도:',
            'm3u8Settings': 'm3u8 스트림 설정',
            'qualityLabel': '품질:',
            'segmentsLabel': '세그먼트:',
            'qualityAuto': '자동',
            'qualityHigh': '최고 화질',
            'qualityMedium': '중간 화질',
            'qualityLow': '최저 화질',
            'requestHeaders': '🔧 요청 헤더',
            'referer': 'Referer:',
            'userAgent': 'User-Agent:',
            'cookie': 'Cookie:',
            'infoLine1': '미디어 스니퍼 Pro v8 · 모듈 구조 · AES-128 복호화 · 가상 리스트 · 진행률',
            'infoLine2': '단축키: Alt+T 번역 · Alt+B 패널 토글 · Esc 닫기',
            'clickTabScan': '위 탭을 클릭하여 스캔 시작',
            'dlProgress': '다운로드 진행률',
            'dlProgressText': '{done} / {total}（실패 {fail}）· {speed} · 남은 시간 {eta}',
            }
    };
    LANG.get = function (key, vars) {
        var lang = (State.config && State.config.uiLang) ? State.config.uiLang : 'zh-CN';
        var t = LANG.strings[lang] || LANG.strings['zh-CN'];
        var val = t[key] !== undefined ? t[key] : key;
        if (vars) {
            for (var k in vars) {
                if (Object.prototype.hasOwnProperty.call(vars, k)) {
                    val = String(val).replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
                }
            }
        }
        return val;
    };
    LANG.t = LANG.get;

        // 🛡 模块 2：安全 (Security) + AES-128 解密
    // =========================================================================
    var SEC = {};
    SEC.ALLOWED_PROTOCOLS = { 'http:': 1, 'https:': 1 };
    SEC.ALLOWED_MIME_PREFIX = { 'image/': 1, 'video/': 1, 'audio/': 1 };

    // ===== URL 安全判断 =====
    SEC.isSafeUrl = function (url) {
        if (!url || !U.isStr(url)) return false;
        var trimmed = url.trim();
        if (!trimmed) return false;
        var lower = trimmed.toLowerCase();
        if (/^\s*javascript\s*:/i.test(lower)) return false;
        if (/^\s*vbscript\s*:/i.test(lower)) return false;
        if (lower.indexOf('data:') === 0) {
            var mime = lower.substring(5).split(';')[0].toLowerCase();
            for (var prefix in SEC.ALLOWED_MIME_PREFIX) if (SEC.ALLOWED_MIME_PREFIX.hasOwnProperty(prefix) && mime.indexOf(prefix) === 0) return true;
            return false;
        }
        if (lower.indexOf('blob:') === 0) return true;
        if (lower.indexOf('file:') === 0) return true;
        try {
            var parsed = new URL(trimmed, location.href);
            return !!SEC.ALLOWED_PROTOCOLS[parsed.protocol];
        } catch (e) {
            if (/^[\/\.]/.test(trimmed)) return true;
            return false;
        }
    };

    SEC.safeUrl = function (url) {
        if (!SEC.isSafeUrl(url)) return '';
        return String(url).trim();
    };

    SEC.absUrl = function (src, baseUrl) {
        if (!src) return '';
        try { return new URL(src, baseUrl || location.href).href; } catch (e) { return String(src).trim(); }
    };

    // ===== 文件名安全化 =====
    SEC.safeFilename = function (name) {
        if (name == null) return 'file-' + U.now();
        var s = String(name);
        try {
            if (/%[0-9a-fA-F]{2}/.test(s)) {
                var decoded = decodeURIComponent(s);
                if (decoded && decoded.indexOf('\u0000') === -1) s = decoded;
            }
        } catch (e) {}
        s = s.replace(/[\x00-\x1F\x7F]/g, '');
        s = s.replace(/[\\\/:\*\?"<>\|]/g, '_');
        s = s.replace(/^[\s\.]+/, '');
        s = s.replace(/[\s\.]+$/, '');
        if (s.length > 180) s = s.substring(0, 170) + '_' + U.now().toString(36).slice(-4);
        if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i.test(s)) s = '_' + s;
        if (!s.trim()) s = 'file-' + U.now();
        return s;
    };

    SEC.extFromUrl = function (url) {
        try {
            var p = new URL(url, location.href).pathname;
            var m = p.match(/\.([a-zA-Z0-9]{1,8})$/);
            return m ? m[1].toLowerCase() : '';
        } catch (e) { return ''; }
    };

    SEC.nameFromUrl = function (url) {
        try { var p = new URL(url, location.href).pathname.split('/'); return p[p.length - 1] || 'file'; } catch (e) { return 'file'; }
    };

    SEC.guessKind = function (url) {
        if (!url || !U.isStr(url)) return '';
        var path = url.toLowerCase().split('?')[0].split('#')[0];
        if (/\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?)$/i.test(path)) return 'image';
        if (/\.(mp4|webm|ogg|ogv|mov|mkv|avi|flv|ts|m4v|3gp|mpeg|mpg|rm|rmvb|wmv)$/i.test(path)) return 'video';
        if (/\.(mp3|wav|flac|aac|oga|opus|m4a|wma|amr|ape|ogg|mid)$/i.test(path)) return 'audio';
        if (/\.m3u8?(\?|#|$)/i.test(path)) return 'm3u8';
        return '';
    };

    SEC.VIDEO_SITES = {
        'bilibili': {
            name: '哔哩哔哩',
            icon: '📺',
            match: function(url) {
                try {
                    var u = new URL(url);
                    var host = u.hostname;
                    return /bilibili\.com$/i.test(host) || /b23\.tv$/i.test(host);
                } catch(e) { return false; }
            },
            isVideo: function(url) {
                try {
                    var u = new URL(url);
                    var path = u.pathname;
                    return /^\/video\/BV/i.test(path) || /^\/video\/av/i.test(path) || /^\/bangumi\/play\//i.test(path);
                } catch(e) { return false; }
            }
        },
        'douyin': {
            name: '抖音',
            icon: '🎵',
            match: function(url) {
                try {
                    var u = new URL(url);
                    return /douyin\.com$/i.test(u.hostname) || /iesdouyin\.com$/i.test(u.hostname);
                } catch(e) { return false; }
            },
            isVideo: function(url) {
                try {
                    var u = new URL(url);
                    return /\/video\//i.test(u.pathname) || /\/note\//i.test(u.pathname);
                } catch(e) { return false; }
            }
        },
        'kuaishou': {
            name: '快手',
            icon: '⚡',
            match: function(url) {
                try {
                    var u = new URL(url);
                    return /kuaishou\.com$/i.test(u.hostname) || /gifshow\.com$/i.test(u.hostname);
                } catch(e) { return false; }
            },
            isVideo: function(url) {
                try {
                    var u = new URL(url);
                    return /\/short-video\//i.test(u.pathname) || /\/video\//i.test(u.pathname);
                } catch(e) { return false; }
            }
        },
        'xiaohongshu': {
            name: '小红书',
            icon: '📕',
            match: function(url) {
                try {
                    var u = new URL(url);
                    return /xiaohongshu\.com$/i.test(u.hostname) || /xhslink\.com$/i.test(u.hostname);
                } catch(e) { return false; }
            },
            isVideo: function(url) {
                try {
                    var u = new URL(url);
                    var path = u.pathname;
                    return /^\/explore\//i.test(path) || /^\/discovery\/item\//i.test(path) || /\/short-video\//i.test(path) || /\/video\//i.test(path);
                } catch(e) { return false; }
            }
        },
        'weibo': {
            name: '微博',
            icon: '🌐',
            match: function(url) {
                try {
                    var u = new URL(url);
                    return /weibo\.com$/i.test(u.hostname) || /weibo\.cn$/i.test(u.hostname);
                } catch(e) { return false; }
            },
            isVideo: function(url) {
                try {
                    var u = new URL(url);
                    return /\/tv\/show\//i.test(u.pathname) || /\/video\//i.test(u.pathname);
                } catch(e) { return false; }
            }
        },
        'zhihu': {
            name: '知乎',
            icon: '💡',
            match: function(url) {
                try {
                    var u = new URL(url);
                    return /zhihu\.com$/i.test(u.hostname);
                } catch(e) { return false; }
            },
            isVideo: function(url) {
                try {
                    var u = new URL(url);
                    var path = u.pathname;
                    return /\/video\//i.test(path) || /\/question\/\d+\/answer\/\d+/i.test(path);
                } catch(e) { return false; }
            }
        },
        'weixin': {
            name: '微信视频号',
            icon: '💬',
            match: function(url) {
                try {
                    var u = new URL(url);
                    return /channels\.weixin\.qq\.com$/i.test(u.hostname);
                } catch(e) { return false; }
            },
            isVideo: function(url) {
                try {
                    var u = new URL(url);
                    return /\/video\//i.test(u.pathname) || /\/feed\//i.test(u.pathname);
                } catch(e) { return false; }
            }
        }
    };

    SEC.detectVideoSite = function(url) {
        if (!url || !U.isStr(url)) return null;
        for (var key in SEC.VIDEO_SITES) {
            if (SEC.VIDEO_SITES.hasOwnProperty(key)) {
                var site = SEC.VIDEO_SITES[key];
                if (site.match(url) && site.isVideo(url)) {
                    return { key: key, name: site.name, icon: site.icon };
                }
            }
        }
        return null;
    };

    // ===== AES-128-CBC 解密（用于 HLS 加密 m3u8）=====
    // 使用浏览器原生 Web Crypto API (crypto.subtle)，保证算法正确性并利用硬件加速
    var AES = {};

    // 将 Uint8Array 转为 16 字节（不足补零，超过截断）
    AES.pad16 = function (bytes) {
        if (!bytes) return null;
        var out = new Uint8Array(16);
        var n = Math.min(16, bytes.length);
        for (var i = 0; i < n; i++) out[i] = bytes[i];
        return out;
    };

    // hex -> Uint8Array
    AES.hexToBytes = function (hex) {
        if (!hex || hex.length % 2 !== 0) return null;
        var out = new Uint8Array(hex.length / 2);
        for (var i = 0; i < hex.length; i += 2) {
            out[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return out;
    };

    // Uint8Array -> 字符串（用于调试，不做 += 拼接）
    AES.bytesToStr = function (arr) {
        if (!arr) return '';
        try {
            if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(arr);
        } catch (e) {}
        // 兜底: 使用 Array.join
        var chars = new Array(arr.length);
        for (var i = 0; i < arr.length; i++) chars[i] = String.fromCharCode(arr[i]);
        return chars.join('');
    };

    // 核心：使用 Web Crypto API 进行 AES-128-CBC 解密
    // keyBytes: Uint8Array(16)
    // ivBytes: Uint8Array(16)
    // data: Uint8Array (待解密数据)
    // cb: function(decryptedUint8Array, err)
    AES.decryptCBC = function (data, keyBytes, ivBytes, cb) {
        if (!data || data.length === 0) { cb(null, '空数据'); return; }
        if (!keyBytes || keyBytes.length !== 16) { cb(null, '密钥长度错误: ' + (keyBytes ? keyBytes.length : 'null')); return; }

        // 对齐到 16 字节块
        var padLen = (16 - (data.length % 16)) % 16;
        var alignedData;
        if (padLen > 0) {
            alignedData = new Uint8Array(data.length + padLen);
            alignedData.set(data, 0);
        } else alignedData = new Uint8Array(data);

        var useIv = ivBytes && ivBytes.length === 16 ? ivBytes : new Uint8Array(16);

        // 优先使用 Web Crypto API
        try {
            if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.decrypt === 'function') {
                crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']).then(function (key) {
                    return crypto.subtle.decrypt({ name: 'AES-CBC', iv: useIv }, key, alignedData.buffer);
                }).then(function (decrypted) {
                    var out = new Uint8Array(decrypted);
                    // PKCS#7 unpadding
                    if (out.length > 0) {
                        var pad = out[out.length - 1];
                        if (pad > 0 && pad <= 16 && out.length >= pad) {
                            var valid = true;
                            for (var i = out.length - pad; i < out.length; i++) {
                                if (out[i] !== pad) { valid = false; break; }
                            }
                            if (valid) out = out.slice(0, out.length - pad);
                        }
                    }
                    cb(out, null);
                }).catch(function (err) {
                    // Web Crypto 失败，提示但返回原始数据（可能未加密或密钥错误）
                    LOG.warn('Web Crypto AES 解密失败:', err && err.message);
                    cb(null, 'AES 解密失败: ' + (err && err.message ? err.message : err));
                });
                return;
            }
        } catch (e) {
            LOG.warn('Web Crypto 不可用，将尝试纯 JS 降级方案:', e.message);
        }

        // 纯 JS 降级方案（简单实现，仅作兜底）
        try {
            cb(data, 'Web Crypto 不可用，纯 JS 降级未实现');
        } catch (e) {
            cb(null, '解密异常: ' + e.message);
        }
    };

    var M3U8 = {};

    M3U8.parse = function (content, baseUrl) {
        var result = {
            isMaster: false,           // 是否是 master playlist（多码率）
            streams: [],               // master 的子流列表 [{url, bandwidth, resolution}]
            segments: [],              // 分片列表 [{url, duration}]
            encrypted: false,          // 是否加密
            keyMethod: null,           // 加密方法（AES-128）
            keyUrl: null,              // 密钥 URL
            keyIv: null,               // IV（16字节）
            duration: 0,               // 总时长（秒）
            targetDuration: 0,         // 分片最大时长
        };
        if (!content) return result;
        var lines = content.split(/\r?\n/);
        var currentKey = null;
        var segDuration = 0;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;

            // #EXT-X-STREAM-INF: 多码率流
            if (line.indexOf('#EXT-X-STREAM-INF:') === 0) {
                result.isMaster = true;
                var info = line.substring('#EXT-X-STREAM-INF:'.length);
                var bandwidth = 0, resolution = '';
                var bwMatch = info.match(/BANDWIDTH=(\d+)/);
                if (bwMatch) bandwidth = parseInt(bwMatch[1], 10);
                var resMatch = info.match(/RESOLUTION=(\d+x\d+)/);
                if (resMatch) resolution = resMatch[1];
                // 下一行是 URL
                if (i + 1 < lines.length) {
                    var nextLine = lines[i + 1].trim();
                    if (nextLine && nextLine.indexOf('#') !== 0) {
                        result.streams.push({
                            url: SEC.absUrl(nextLine, baseUrl),
                            bandwidth: bandwidth,
                            resolution: resolution,
                            label: bandwidth > 5000000 ? '高清' : bandwidth > 2000000 ? '标清' : '低清'
                        });
                        i++; // 跳过 URL 行
                    }
                }
            }
            // #EXT-X-KEY: 加密信息
            else if (line.indexOf('#EXT-X-KEY:') === 0) {
                result.encrypted = true;
                var keyInfo = line.substring('#EXT-X-KEY:'.length);
                var methodMatch = keyInfo.match(/METHOD=(\w+)/);
                if (methodMatch) result.keyMethod = methodMatch[1];
                var uriMatch = keyInfo.match(/URI="([^"]+)"/);
                if (uriMatch) result.keyUrl = uriMatch[1];
                var ivMatch = keyInfo.match(/IV=0x([0-9a-fA-F]+)/);
                if (ivMatch) result.keyIv = AES.hexToBytes(ivMatch[1]);
                else result.keyIv = null; // 默认用序号作为 IV
            }
            // #EXT-X-TARGETDURATION: 分片最大时长
            else if (line.indexOf('#EXT-X-TARGETDURATION:') === 0) {
                var tdMatch = line.match(/#EXT-X-TARGETDURATION:(\d+)/);
                if (tdMatch) result.targetDuration = parseInt(tdMatch[1], 10);
            }
            // #EXTINF: 分片时长
            else if (line.indexOf('#EXTINF:') === 0) {
                var durMatch = line.match(/#EXTINF:([\d.]+)/);
                if (durMatch) segDuration = parseFloat(durMatch[1]);
            }
            // 非 # 开头的行：分片 URL 或子 m3u8 URL
            else if (line.indexOf('#') !== 0) {
                if (!result.isMaster) {
                    result.segments.push({
                        url: SEC.absUrl(line, baseUrl),
                        duration: segDuration
                    });
                    result.duration += segDuration;
                    segDuration = 0;
                }
            }
            // #EXT-X-ENDLIST: 结束标记
            else if (line === '#EXT-X-ENDLIST') {
                // 流结束
            }
        }
        LOG.info('M3U8 解析完成:', result.isMaster ? 'master' : 'media', 
                 result.isMaster ? result.streams.length + ' streams' : result.segments.length + ' segments',
                 result.encrypted ? 'encrypted:' + result.keyMethod : 'unencrypted');
        return result;
    };

    // ===== 获取密钥 =====
    M3U8.fetchKey = function (keyUrl, cb) {
        // 优先使用 GM_xmlhttpRequest 支持跨域；失败降级到 XHR
        var useGM = (typeof GM_xmlhttpRequest === 'function');
        var method = useGM ? 'GM_xmlhttpRequest' : 'XMLHttpRequest';
        LOG.info('密钥请求方式:', method, 'URL:', keyUrl);

        try {
            if (useGM) {
                var gmTimeout = setTimeout(function () { cb(null, '密钥请求超时'); }, 25000);
                try {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: keyUrl,
                        responseType: 'arraybuffer',
                        onload: function (resp) {
                            clearTimeout(gmTimeout);
                            try {
                                if (resp.status >= 200 && resp.status < 300 && resp.response) {
                                    var keyBytes = new Uint8Array(resp.response);
                                    if (keyBytes.length === 16) { LOG.info('密钥获取成功 (GM)'); cb(keyBytes, null); }
                                    else cb(null, '密钥长度错误: ' + keyBytes.length);
                                } else cb(null, '密钥请求失败 (GM): ' + resp.status);
                            } catch (err) { cb(null, 'GM 密钥处理异常: ' + err.message); }
                        },
                        onerror: function (err) {
                            clearTimeout(gmTimeout);
                            LOG.warn('GM 密钥请求失败，降级 XHR:', err);
                            // 降级 XHR
                            var xhr = new XMLHttpRequest();
                            xhr.open('GET', keyUrl, true);
                            xhr.responseType = 'arraybuffer';
                            xhr.timeout = 15000;
                            xhr.onload = function () {
                                if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
                                    var keyBytes = new Uint8Array(xhr.response);
                                    if (keyBytes.length === 16) { LOG.info('密钥获取成功 (XHR)'); cb(keyBytes, null); }
                                    else cb(null, '密钥长度错误: ' + keyBytes.length);
                                } else cb(null, '密钥请求失败: ' + xhr.status);
                            };
                            xhr.onerror = function () { cb(null, '密钥请求网络错误'); };
                            xhr.ontimeout = function () { cb(null, '密钥请求超时'); };
                            xhr.send();
                        },
                        ontimeout: function () { cb(null, '密钥请求超时'); }
                    });
                } catch (ge) { cb(null, 'GM 请求异常: ' + ge.message); }
            } else {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', keyUrl, true);
                xhr.responseType = 'arraybuffer';
                xhr.timeout = 15000;
                xhr.onload = function () {
                    if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
                        var keyBytes = new Uint8Array(xhr.response);
                        if (keyBytes.length === 16) { LOG.info('密钥获取成功'); cb(keyBytes, null); }
                        else cb(null, '密钥长度错误: ' + keyBytes.length);
                    } else cb(null, '密钥请求失败: ' + xhr.status);
                };
                xhr.onerror = function () { cb(null, '密钥请求网络错误'); };
                xhr.ontimeout = function () { cb(null, '密钥请求超时'); };
                xhr.send();
            }
        } catch (e) { cb(null, '密钥请求异常: ' + e.message); }
    };

    // ===== 下载单个分片 =====
    M3U8.fetchSegment = function (segUrl, cb) {
        // 优先使用 GM_xmlhttpRequest 支持跨域；失败降级到 XHR
        var useGM = (typeof GM_xmlhttpRequest === 'function');

        try {
            if (useGM) {
                var gmTimeout = setTimeout(function () { cb(null, '分片请求超时'); }, 40000);
                try {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: segUrl,
                        responseType: 'arraybuffer',
                        onload: function (resp) {
                            clearTimeout(gmTimeout);
                            try {
                                if (resp.status >= 200 && resp.status < 300 && resp.response) {
                                    cb(new Uint8Array(resp.response), null);
                                } else cb(null, '分片请求失败: ' + resp.status);
                            } catch (err) { cb(null, 'GM 分片处理异常: ' + err.message); }
                        },
                        onerror: function (err) {
                            clearTimeout(gmTimeout);
                            LOG.warn('GM 分片请求失败，降级 XHR');
                            var xhr = new XMLHttpRequest();
                            xhr.open('GET', segUrl, true);
                            xhr.responseType = 'arraybuffer';
                            xhr.timeout = 30000;
                            xhr.onload = function () {
                                if (xhr.status >= 200 && xhr.status < 300 && xhr.response) cb(new Uint8Array(xhr.response), null);
                                else cb(null, '分片请求失败: ' + xhr.status);
                            };
                            xhr.onerror = function () { cb(null, '分片网络错误'); };
                            xhr.ontimeout = function () { cb(null, '分片超时'); };
                            xhr.send();
                        },
                        ontimeout: function () { cb(null, '分片请求超时'); }
                    });
                } catch (ge) { cb(null, 'GM 分片请求异常: ' + ge.message); }
            } else {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', segUrl, true);
                xhr.responseType = 'arraybuffer';
                xhr.timeout = 30000;
                xhr.onload = function () {
                    if (xhr.status >= 200 && xhr.status < 300 && xhr.response) cb(new Uint8Array(xhr.response), null);
                    else cb(null, '分片请求失败: ' + xhr.status);
                };
                xhr.onerror = function () { cb(null, '分片网络错误'); };
                xhr.ontimeout = function () { cb(null, '分片超时'); };
                xhr.send();
            }
        } catch (e) { cb(null, '分片请求异常: ' + e.message); }
    };

    // ===== 下载并解密所有分片，合并为完整视频 =====
    M3U8.downloadAndMerge = function (m3u8Url, options, progressCb, doneCb) {
        // options: {quality: 'auto'|'high'|'medium'|'low', concurrency: 3}
        var opts = options || {};
        var concurrency = opts.concurrency || 3;
        var qualityPref = opts.quality || 'auto';

        // 获取 m3u8 内容（优先 GM_xmlhttpRequest 支持跨域）
        try {
            var fetchM3u8 = function(url, onOk, onErr) {
                if (typeof GM_xmlhttpRequest === 'function') {
                    try {
                        GM_xmlhttpRequest({
                            method: 'GET', url: url, timeout: 25000,
                            onload: function (resp) {
                                if (resp.status >= 200 && resp.status < 300 && resp.responseText) onOk(resp.responseText);
                                else onErr('m3u8 请求失败: ' + resp.status);
                            },
                            onerror: function () {
                                LOG.warn('GM m3u8 请求失败，降级 XHR');
                                var xhr = new XMLHttpRequest();
                                xhr.open('GET', url, true); xhr.timeout = 20000;
                                xhr.onload = function () {
                                    if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) onOk(xhr.responseText);
                                    else onErr('m3u8 请求失败: ' + xhr.status);
                                };
                                xhr.onerror = function () { onErr('m3u8 网络错误'); };
                                xhr.ontimeout = function () { onErr('m3u8 超时'); };
                                xhr.send();
                            },
                            ontimeout: function () { onErr('m3u8 请求超时'); }
                        });
                        return;
                    } catch (ge) { LOG.warn('GM m3u8 请求异常:', ge.message); }
                }
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true); xhr.timeout = 20000;
                xhr.onload = function () {
                    if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) onOk(xhr.responseText);
                    else onErr('m3u8 请求失败: ' + xhr.status);
                };
                xhr.onerror = function () { onErr('m3u8 网络错误'); };
                xhr.ontimeout = function () { onErr('m3u8 超时'); };
                xhr.send();
            };

            fetchM3u8(m3u8Url, function(m3u8Text) {
                var parsed = M3U8.parse(m3u8Text, m3u8Url);
                if (parsed.isMaster && parsed.streams.length > 0) {
                    var selectedStream = M3U8.selectStream(parsed.streams, qualityPref);
                    LOG.info('选择码率:', selectedStream.label, selectedStream.resolution);
                    M3U8.downloadAndMerge(selectedStream.url, opts, progressCb, doneCb);
                    return;
                }
                if (parsed.segments.length === 0) { doneCb(null, 'm3u8 无分片'); return; }
                LOG.info('开始下载分片:', parsed.segments.length, '加密:', parsed.encrypted);

                var proceed = function(key) {
                    M3U8._downloadSegments(parsed.segments, key, parsed.keyIv, concurrency, progressCb, doneCb);
                };
                if (parsed.encrypted && parsed.keyUrl) {
                    M3U8.fetchKey(parsed.keyUrl, function(key, err) {
                        if (err) { doneCb(null, err); return; }
                        proceed(key);
                    });
                } else {
                    proceed(null);
                }
            }, function(err) { doneCb(null, err); });
        } catch (e) { doneCb(null, 'm3u8 异常: ' + e.message); }
    };

    // ===== 选择码率 =====
    M3U8.selectStream = function (streams, preference) {
        if (!streams || streams.length === 0) return null;
        streams.sort(function (a, b) { return b.bandwidth - a.bandwidth; });
        if (preference === 'high' || preference === '高清') return streams[0];
        if (preference === 'low' || preference === '低清') return streams[streams.length - 1];
        if (preference === 'medium' || preference === '标清') return streams[Math.floor(streams.length / 2)];
        return streams[Math.floor(streams.length / 2)];
    };

    // ===== 批量下载分片并合并（支持异步 AES 解密）=====
    M3U8._downloadSegments = function (segments, key, iv, concurrency, progressCb, doneCb) {
        var total = segments.length;
        var downloaded = 0;
        var failed = 0;
        var chunks = new Array(total);
        var idx = 0;
        var running = 0;
        M3U8._stopped = false;
        var completed = new Array(total); // 记录每个分片是否完成

        function tryFinish() {
            if (idx < total) return;
            if (running > 0) return;
            if (M3U8._stopped) return;
            if (failed > 0) { doneCb(null, '下载失败 ' + failed + ' 个分片'); return; }
            var totalLen = 0;
            for (var i = 0; i < total; i++) if (chunks[i]) totalLen += chunks[i].length;
            var merged = new Uint8Array(totalLen);
            var offset = 0;
            for (var i = 0; i < total; i++) {
                if (chunks[i]) {
                    merged.set(chunks[i], offset);
                    offset += chunks[i].length;
                }
            }
            LOG.info('分片合并完成:', totalLen, '字节');
            doneCb(merged, null);
        }

        function makeIv(segIndex) {
            if (iv && iv.length === 16) return iv;
            // HLS 默认：使用分片序号（Media Sequence Number）作为 IV
            var out = new Uint8Array(16);
            var seqNum = segIndex; // 使用数组下标近似
            var str = (seqNum || 0).toString(16).padStart(32, '0');
            for (var i = 0; i < 16; i++) out[i] = parseInt(str.substr(i * 2, 2), 16);
            return out;
        }

        function worker() {
            if (M3U8._stopped || idx >= total) { tryFinish(); return; }
            var curIdx = idx++;
            running++;
            M3U8.fetchSegment(segments[curIdx].url, function (data, err) {
                if (err) {
                    failed++; running--;
                    LOG.warn('分片下载失败:', curIdx, err);
                    if (!M3U8._stopped) worker(); else tryFinish();
                    return;
                }
                // 如果加密，使用异步 AES-128-CBC 解密
                if (key) {
                    var segIv = makeIv(curIdx);
                    AES.decryptCBC(data, key, segIv, function (dec, derr) {
                        if (derr) {
                            failed++; running--;
                            LOG.warn('分片解密失败:', curIdx, derr);
                            if (!M3U8._stopped) worker(); else tryFinish();
                            return;
                        }
                        chunks[curIdx] = dec;
                        downloaded++; running--;
                        if (progressCb) progressCb(downloaded, total, failed);
                        if (!M3U8._stopped) worker(); else tryFinish();
                    });
                } else {
                    chunks[curIdx] = data;
                    downloaded++; running--;
                    if (progressCb) progressCb(downloaded, total, failed);
                    if (!M3U8._stopped) worker(); else tryFinish();
                }
            });
        }

        for (var w = 0; w < concurrency; w++) worker();
    };

    // ===== 停止下载 =====
    M3U8.stopDownload = function () {
        M3U8._stopped = true;
    };

        // ===== 生成下载脚本（跨域兜底）=====
    M3U8.generateDownloadScript = function (m3u8Url, format) {
        // format: 'curl' | 'wget' | 'aria2'
        var script = '';
        var filename = SEC.safeFilename(SEC.nameFromUrl(m3u8Url)) + '.mp4';
        
        if (format === 'aria2') {
            script = '# aria2 下载脚本（支持多线程）\n';
            script += '# 使用方法: aria2c -i download.txt\n\n';
            script += m3u8Url + '\n';
            script += '  out=' + filename + '\n';
            script += '  split=16\n';
            script += '  header="User-Agent: Mozilla/5.0"\n';
        } else if (format === 'wget') {
            script = '# wget 下载脚本\n';
            script += '# 使用方法: wget -i download.txt\n\n';
            script += '--user-agent="Mozilla/5.0"\n';
            script += '--referer="' + SEC.absUrl(m3u8Url) + '"\n';
            script += '-O "' + filename + '"\n';
            script += m3u8Url + '\n';
        } else {
            script = '# curl 下载脚本\n';
            script += '# 使用方法: bash download.sh\n\n';
            script += 'curl -L -A "Mozilla/5.0" -e "' + SEC.absUrl(m3u8Url) + '" -o "' + filename + '" "' + m3u8Url + '"\n';
        }
        return script;
    };

    // =========================================================================
    // 💾 模块 4：状态管理 (State) + 配置校验
    // =========================================================================
    var DEFAULT_CONFIG = {
        theme: 'auto',
        uiLang: 'zh-CN',           // 界面语言: zh-CN / en-US / ja-JP / ko-KR
        nameTpl: '{域名}_{日期}_{序号}_{后缀}',
        whitelist: [],
        blacklist: [],
        whitelistMode: false,
        panelWidth: 460,
        btnPos: null,
        translateFrom: 'auto',
        translateTo: 'zh-CN',
        batchConcurrency: 3,
        batchRetry: 2,
        batchDelay: 400,
        showStatusBar: true,
        logLevel: 1, // INFO
        // 高级筛选阈值
        minImageSize: 1024,
        minImageWidth: 50,
        minImageHeight: 50,
        minVideoDuration: 1,
        maxVideoDuration: 0,
        minAudioDuration: 1,
        // 显示筛选（新增）
        showMinSizeKB: 0,          // 显示最小大小 (KB), 0=不限制
        showMaxSizeKB: 0,          // 显示最大大小 (KB), 0=不限制
        autoExtractThumb: true,    // 自动提取视频封面作为缩略图
        // 自定义请求头
        customHeaders: {
            Referer: '',
            UserAgent: '',
            Cookie: ''
        },
        // m3u8 设置
        m3u8Quality: 'auto',
        m3u8Concurrency: 3,
        m3u8AutoMerge: true,
        // 多标签页同步
        enableSync: true,
        // 自定义域名规则（新增）
        domainRules: [],            // [{domain: "baidu.com", img: true, video: true, audio: true, depth: 1}]
    };

    var State = {
        config: U.deepClone(DEFAULT_CONFIG),
        tab: 'img',
        images: [], videos: [], audios: [], m3u8: [], videoLinks: [],
        selected: new Set(),
        searchKeyword: '',
        panel: null, panelOpen: false,
        floatBtn: null,
        translateCache: {},
        downloading: false,
        downloadProgress: null,  // {total, done, failed, speed, eta}
        // P1-2: 元信息缓存
        metaCache: {},           // url -> {size, width, height, duration, type}
        // P2-4: 多标签页同步
        syncChannel: null,
    };

    // ===== 配置校验 =====
    State.validateConfig = function (cfg) {
        var errors = [];
        if (!cfg) return ['配置为空'];
        // 检查必要字段类型
        if (typeof cfg.theme !== 'string' || !['auto','light','dark'].includes(cfg.theme)) errors.push('theme 必须是 auto/light/dark');
        if (typeof cfg.nameTpl !== 'string' || cfg.nameTpl.length > 200) errors.push('nameTpl 必须是字符串且不超过200字符');
        if (!U.isArr(cfg.whitelist)) errors.push('whitelist 必须是数组');
        if (!U.isArr(cfg.blacklist)) errors.push('blacklist 必须是数组');
        if (typeof cfg.whitelistMode !== 'boolean') errors.push('whitelistMode 必须是布尔值');
        if (!U.isNum(cfg.panelWidth) || cfg.panelWidth < 300 || cfg.panelWidth > 1000) errors.push('panelWidth 必须在 300-1000');
        if (!U.isNum(cfg.batchConcurrency) || cfg.batchConcurrency < 1 || cfg.batchConcurrency > 8) errors.push('batchConcurrency 必须在 1-8');
        if (!U.isNum(cfg.batchRetry) || cfg.batchRetry < 0 || cfg.batchRetry > 10) errors.push('batchRetry 必须在 0-10');
        if (!U.isNum(cfg.batchDelay) || cfg.batchDelay < 50 || cfg.batchDelay > 5000) errors.push('batchDelay 必须在 50-5000');
        if (!U.isNum(cfg.logLevel) || cfg.logLevel < 0 || cfg.logLevel > 3) errors.push('logLevel 必须在 0-3');
        if (!U.isNum(cfg.minImageSize) || cfg.minImageSize < 0) errors.push('minImageSize 必须 >= 0');
        if (!U.isNum(cfg.minImageWidth) || cfg.minImageWidth < 0) errors.push('minImageWidth 必须 >= 0');
        if (!U.isNum(cfg.minImageHeight) || cfg.minImageHeight < 0) errors.push('minImageHeight 必须 >= 0');
        if (!U.isNum(cfg.minVideoDuration) || cfg.minVideoDuration < 0) errors.push('minVideoDuration 必须 >= 0');
        if (!U.isNum(cfg.maxVideoDuration) || cfg.maxVideoDuration < 0) errors.push('maxVideoDuration 必须 >= 0');
        if (!U.isNum(cfg.minAudioDuration) || cfg.minAudioDuration < 0) errors.push('minAudioDuration 必须 >= 0');
        if (typeof cfg.m3u8Quality !== 'string' || !['auto','high','medium','low'].includes(cfg.m3u8Quality)) errors.push('m3u8Quality 必须是 auto/high/medium/low');
        if (!U.isNum(cfg.m3u8Concurrency) || cfg.m3u8Concurrency < 1 || cfg.m3u8Concurrency > 8) errors.push('m3u8Concurrency 必须在 1-8');
        if (typeof cfg.m3u8AutoMerge !== 'boolean') errors.push('m3u8AutoMerge 必须是布尔值');
        if (typeof cfg.enableSync !== 'boolean') errors.push('enableSync 必须是布尔值');
        return errors;
    };

    State._mergeDefault = function (cfg) {
        if (!cfg || typeof cfg !== 'object') return U.deepClone(DEFAULT_CONFIG);
        var out = U.deepClone(DEFAULT_CONFIG);
        for (var k in DEFAULT_CONFIG) if (DEFAULT_CONFIG.hasOwnProperty(k) && cfg[k] !== undefined) out[k] = cfg[k];
        return out;
    };

    State.load = function () {
        try {
            if (typeof GM_getValue === 'function') {
                var raw = GM_getValue('ms_config_v8', null);
                if (raw && typeof raw === 'object') {
                    var errors = State.validateConfig(raw);
                    if (errors.length > 0) {
                        LOG.warn('配置校验失败:', errors);
                        State.config = U.deepClone(DEFAULT_CONFIG);
                    } else {
                        State.config = State._mergeDefault(raw);
                    }
                }
            }
        } catch (e) { LOG.error('配置加载失败:', e); }
        // 设置日志级别
        LOG.setLevel(State.config.logLevel);
        // 计算主题
        State._computeTheme();
        // 初始化多标签页同步
        if (State.config.enableSync) State._initSync();
    };

    State.save = function () {
        try {
            if (typeof GM_setValue === 'function') GM_setValue('ms_config_v8', State.config);
            if (State.syncChannel) State._broadcast({ type: 'config', data: State.config });
        } catch (e) { LOG.error('配置保存失败:', e); }
    };

    State._computeTheme = function () {
        var theme = State.config.theme;
        if (theme === 'auto') {
            // 跟随系统：检查 prefers-color-scheme
            try {
                if (typeof matchMedia === 'function') {
                    var m = matchMedia('(prefers-color-scheme: dark)');
                    State._computedTheme = m.matches ? 'dark' : 'light';
                    // 监听系统主题变化
                    if (typeof m.addEventListener === 'function') {
                        m.addEventListener('change', function(ev) {
                            State._computedTheme = ev.matches ? 'dark' : 'light';
                            if (typeof applyPanelThemeNow === 'function') applyPanelThemeNow();
                        });
                    } else if (typeof m.addListener === 'function') {
                        m.addListener(function(ev) {
                            State._computedTheme = ev.matches ? 'dark' : 'light';
                            if (typeof applyPanelThemeNow === 'function') applyPanelThemeNow();
                        });
                    }
                    return;
                }
            } catch (e) {}
            State._computedTheme = 'dark';
        } else {
            State._computedTheme = theme;
        }
    };

    State.getTheme = function () {
        State._computeTheme();
        return State._computedTheme;
    };

    // ===== 多标签页同步（BroadcastChannel）=====
    State._initSync = function () {
        try {
            if (typeof BroadcastChannel === 'function') {
                State.syncChannel = new BroadcastChannel('media-sniffer-sync');
                State.syncChannel.onmessage = function (ev) {
                    try {
                        var msg = ev.data;
                        if (msg && msg.type === 'config') {
                            LOG.info('收到同步配置');
                            State.config = State._mergeDefault(msg.data);
                            State._computeTheme();
                            if (State._applyTheme) State._applyTheme();
                        } else if (msg && msg.type === 'resources') {
                            LOG.info('收到同步资源');
                            State.images = msg.data.images || [];
                            State.videos = msg.data.videos || [];
                            State.audios = msg.data.audios || [];
                            State.m3u8 = msg.data.m3u8 || [];
                            if (State._renderThrottled) State._renderThrottled();
                        }
                    } catch (e) { LOG.error('同步消息处理失败:', e); }
                };
            }
        } catch (e) { LOG.warn('BroadcastChannel 不可用:', e); }
    };

    State._broadcast = function (msg) {
        try { if (State.syncChannel) State.syncChannel.postMessage(msg); } catch (e) {}
    };

    State.exportConfig = function () { return JSON.stringify(State.config, null, 2); };
    State.importConfig = function (jsonStr) {
        try {
            var parsed = U.safeJson(jsonStr, null);
            if (!parsed || typeof parsed !== 'object') return { ok: false, msg: 'JSON 格式错误' };
            var errors = State.validateConfig(parsed);
            if (errors.length > 0) return { ok: false, msg: '配置校验失败:\n' + errors.join('\n') };
            State.config = State._mergeDefault(parsed);
            State.save();
            LOG.setLevel(State.config.logLevel);
            return { ok: true, msg: '✅ 配置已导入并校验通过' };
        } catch (e) { return { ok: false, msg: '解析失败: ' + e.message }; }
    };
    State.resetConfig = function () {
        State.config = U.deepClone(DEFAULT_CONFIG);
        State.save();
        LOG.setLevel(DEFAULT_CONFIG.logLevel);
    };

    State.shouldRun = function () {
        try {
            var host = location.hostname;
            if (State.config.whitelistMode) {
                for (var i = 0; i < State.config.whitelist.length; i++)
                    if (host === State.config.whitelist[i] || host.indexOf('.' + State.config.whitelist[i]) !== -1) return true;
                return false;
            }
            for (var j = 0; j < State.config.blacklist.length; j++)
                if (host === State.config.blacklist[j] || host.indexOf('.' + State.config.blacklist[j]) !== -1) return false;
        } catch (e) {}
        return true;
    };

    State.listFor = function (tab) {
        if (tab === 'img') return State.images;
        if (tab === 'video') return State.videos;
        if (tab === 'audio') return State.audios;
        if (tab === 'm3u8') return State.m3u8;
        return [];
    };

    // =========================================================================
    // 🕵 模块 5：网络拦截 (Net Hook) + 防抖聚合
    // =========================================================================
    var NetState = { hits: new Set(), queue: [], flushing: false };
    NetState._flush = function () {
        if (NetState.flushing || NetState.queue.length === 0) return;
        NetState.flushing = true;
        var batch = NetState.queue.splice(0, Math.min(100, NetState.queue.length));
        for (var i = 0; i < batch.length; i++) {
            var url = batch[i];
            if (!url || NetState.hits.has(url) || !SEC.isSafeUrl(url)) continue;
            NetState.hits.add(url);
            var abs = SEC.absUrl(url);
            var kind = SEC.guessKind(abs);
            if (kind === 'image') State.images.push(abs);
            else if (kind === 'video') State.videos.push(abs);
            else if (kind === 'audio') State.audios.push(abs);
            else if (kind === 'm3u8') State.m3u8.push(abs);
        }
        State.images = U.uniq(State.images);
        State.videos = U.uniq(State.videos);
        State.audios = U.uniq(State.audios);
        State.m3u8 = U.uniq(State.m3u8);
        NetState.flushing = false;
        if (State.panel && State.panelOpen && State._renderThrottled) {
            var t = State.tab;
            if (t === 'img' || t === 'video' || t === 'audio' || t === 'm3u8') State._renderThrottled();
        }
        // 同步到其他标签页
        if (State.config.enableSync) State._broadcast({ type: 'resources', data: { images: State.images, videos: State.videos, audios: State.audios, m3u8: State.m3u8 } });
    };
    NetState._scheduleFlush = U.throttle(NetState._flush, 500);
    NetState.collect = function (url) {
        if (!url || !U.isStr(url) || url.length < 6) return;
        NetState.queue.push(url.trim());
        NetState._scheduleFlush();
    };

    function installNetHook() {
        try {
            var OrigXHR = window.XMLHttpRequest;
            if (!OrigXHR) return;
            var origOpen = OrigXHR.prototype.open;
            if (origOpen && U.isFn(origOpen)) {
                OrigXHR.prototype.open = function (method, url) {
                    try { if (url) NetState.collect(String(url)); } catch (e) {}
                    return origOpen.apply(this, arguments);
                };
            }
            if (U.isFn(window.fetch)) {
                var origFetch = window.fetch;
                window.fetch = function (input, init) {
                    try {
                        var url = U.isStr(input) ? input : (input && input.url ? input.url : '');
                        if (url) NetState.collect(String(url));
                    } catch (e) {}
                    return origFetch.apply(this, arguments);
                };
            }
            LOG.info('网络拦截已安装');
        } catch (e) { LOG.warn('网络拦截安装失败:', e); }
    }

    // =========================================================================
    // 📣 模块 6：Toast + 状态条
    // =========================================================================
    var STATUS_BAR = null;
    function showStatus(text, color, autoHideMs) {
        try {
            if (State.config && State.config.showStatusBar === false) return;
            var host = document.documentElement || document.body;
            if (!host) return false;
            var _remove = function (el) {
                try { el.style.transition = 'opacity 0.6s ease'; el.style.opacity = '0'; setTimeout(function () { try { el.remove(); } catch (ee) {} }, 650); } catch (e) { try { el.remove(); } catch (ee) {} }
            };
            if (!STATUS_BAR) {
                STATUS_BAR = document.createElement('div');
                STATUS_BAR.id = '_ms_status';
                STATUS_BAR.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:7px 12px;background:' + (color || '#10b981') + ';color:#fff;font-size:12px;font-weight:600;z-index:2147483647;text-align:center;font-family:system-ui,sans-serif;border-bottom:2px solid rgba(0,0,0,.15);box-shadow:0 2px 8px rgba(0,0,0,.2);cursor:pointer;opacity:1;';
                host.appendChild(STATUS_BAR);
                STATUS_BAR.addEventListener('click', function () { _remove(STATUS_BAR); });
            } else { STATUS_BAR.style.display = ''; STATUS_BAR.style.opacity = '1'; }
            STATUS_BAR.textContent = text;
            STATUS_BAR.style.background = color || '#10b981';
            var delay = (typeof autoHideMs === 'number' && autoHideMs > 0) ? autoHideMs : 3000;
            try { if (STATUS_BAR._hideTimer) clearTimeout(STATUS_BAR._hideTimer); } catch (e) {}
            STATUS_BAR._hideTimer = setTimeout(function () { _remove(STATUS_BAR); }, delay);
            return true;
        } catch (e) { return false; }
    }

    function toast(msg, color, dur) {
        try {
            var t = document.createElement('div');
            t.textContent = msg;
            t.style.cssText = 'position:fixed;left:50%;top:60px;transform:translateX(-50%);padding:10px 20px;border-radius:12px;background:' + (color || '#10b981') + ';color:#fff;font-size:14px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,.3);z-index:2147483646;pointer-events:none;max-width:90vw;text-align:center;';
            (document.documentElement || document.body).appendChild(t);
            setTimeout(function () { try { t.remove(); } catch (e) {} }, dur || 2500);
        } catch (e) {}
    }

    function copyText(text) {
        try { if (typeof GM_setClipboard === 'function') { GM_setClipboard(text); toast(LANG.t('copiedN', {n: String(text).length})); return; } } catch (e) {}
        try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(function () { toast(LANG.t('copied')); }, function () { fallbackCopy(text); }); return; } } catch (e) {}
        fallbackCopy(text);
    }
    function fallbackCopy(text) {
        try { var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;'; (document.documentElement || document.body).appendChild(ta); ta.focus(); ta.select(); document.execCommand('copy'); try { ta.remove(); } catch (e) {} toast(LANG.t('copied')); } catch (e) { toast(LANG.t('copyFail'), '#ef4444'); }
    }

    // =========================================================================
    // 🎬 模块 6b：视频平台地址解析 (Video Resolver)
    // =========================================================================
    var VideoResolver = {};
    VideoResolver._cache = {};
    VideoResolver._errorCache = {};
    VideoResolver._retryTimes = 3;
    VideoResolver._maxConcurrent = 3;
    VideoResolver._timeout = 15000;
    VideoResolver._errorCacheTTL = 5 * 60 * 1000;

    VideoResolver._isErrorCached = function(url) {
        var cached = VideoResolver._errorCache[url];
        if (!cached) return false;
        if (Date.now() - cached.timestamp > VideoResolver._errorCacheTTL) {
            delete VideoResolver._errorCache[url];
            return false;
        }
        return true;
    };

    VideoResolver._cacheError = function(url, err) {
        VideoResolver._errorCache[url] = {
            error: err,
            timestamp: Date.now()
        };
    };

    VideoResolver.resolve = function(url, cb, options) {
        if (VideoResolver._cache[url]) { cb(VideoResolver._cache[url], null); return; }
        if (VideoResolver._isErrorCached(url)) {
            cb(null, VideoResolver._errorCache[url].error);
            return;
        }
        var site = SEC.detectVideoSite(url);
        if (!site) { cb(null, '不支持的视频站点'); return; }
        var retryTimes = (options && options.retryTimes) || VideoResolver._retryTimes;
        var attempt = 0;
        var resolver = null;
        var timedOut = false;
        var resolveTimeout = null;
        if (site.key === 'bilibili') {
            resolver = VideoResolver._resolveBilibili;
        } else if (site.key === 'douyin') {
            resolver = VideoResolver._resolveDouyin;
        } else if (site.key === 'kuaishou') {
            resolver = VideoResolver._resolveKuaishou;
        } else if (site.key === 'xiaohongshu') {
            resolver = VideoResolver._resolveXiaohongshu;
        } else if (site.key === 'weibo') {
            resolver = VideoResolver._resolveWeibo;
        } else if (site.key === 'zhihu') {
            resolver = VideoResolver._resolveZhihu;
        } else if (site.key === 'weixin') {
            resolver = VideoResolver._resolveWeixin;
        } else {
            cb(null, '暂不支持解析 ' + site.name);
            return;
        }
        var tryResolve = function() {
            var currentAttempt = attempt;
            var attemptTimedOut = false;
            var attemptTimeout = setTimeout(function() {
                attemptTimedOut = true;
                handleAttemptError('解析超时');
            }, VideoResolver._timeout);
            var callbackCalled = false;
            resolver(url, function(data, err) {
                if (callbackCalled) return;
                callbackCalled = true;
                clearTimeout(attemptTimeout);
                if (attemptTimedOut) return;
                if (data) {
                    clearTimeout(resolveTimeout);
                    VideoResolver._cache[url] = data;
                    cb(data, null);
                } else {
                    handleAttemptError(err);
                }
            }, currentAttempt);
        };
        var handleAttemptError = function(err) {
            attempt++;
            if (attempt < retryTimes) {
                var delay = 500 * Math.pow(2, attempt - 1);
                setTimeout(tryResolve, delay);
            } else {
                clearTimeout(resolveTimeout);
                VideoResolver._cacheError(url, err || '解析失败');
                cb(null, err || '解析失败');
            }
        };
        resolveTimeout = setTimeout(function() {
            timedOut = true;
            VideoResolver._cacheError(url, '解析总超时');
            cb(null, '解析总超时');
        }, VideoResolver._timeout * retryTimes);
        tryResolve();
    };

    VideoResolver._classifyError = function(data, errType) {
        if (errType === 'network') return { type: 'network', message: '网络错误，请检查网络连接' };
        if (errType === 'timeout') return { type: 'timeout', message: '请求超时，请稍后重试' };
        if (data && data.code === -101) return { type: 'login', message: '需要登录Cookie，请先登录B站' };
        if (data && data.code === -102) return { type: 'cookie_expired', message: 'Cookie已过期，请重新登录B站' };
        if (data && data.code === -403) return { type: 'region_limit', message: '该视频受地域限制，无法观看' };
        if (data && data.code === -402) return { type: 'vip_only', message: '该视频需要大会员才能观看' };
        if (data && data.code === 69000) return { type: 'vip_only', message: '该视频需要大会员才能观看' };
        if (data && data.code === 69001) return { type: 'region_limit', message: '该视频受地域限制，无法观看' };
        if (data && data.code === -412) return { type: 'rate_limit', message: '接口限流，请稍后再试' };
        if (data && data.code === -404) return { type: 'not_found', message: '视频不存在或已被删除' };
        if (data && data.message) {
            var msg = data.message || '';
            if (msg.indexOf('登录') !== -1 || msg.indexOf('cookie') !== -1 || msg.indexOf('Cookie') !== -1) {
                return { type: 'cookie_expired', message: 'Cookie已过期，请重新登录B站' };
            }
            if (msg.indexOf('地域') !== -1 || msg.indexOf('地区') !== -1 || msg.indexOf('限制') !== -1) {
                return { type: 'region_limit', message: '该视频受地域限制，无法观看' };
            }
            if (msg.indexOf('会员') !== -1 || msg.indexOf('VIP') !== -1 || msg.indexOf('付费') !== -1) {
                return { type: 'vip_only', message: '该视频需要大会员才能观看' };
            }
            return { type: 'api', message: data.message };
        }
        return { type: 'unknown', message: errType || '未知错误' };
    };

    VideoResolver._resolveBilibili = function(pageUrl, cb, attempt) {
        attempt = attempt || 0;
        try {
            var bvMatch = pageUrl.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
            var avMatch = pageUrl.match(/\/video\/av(\d+)/i);
            var bvid = bvMatch ? bvMatch[1] : '';
            var aid = avMatch ? avMatch[1] : '';
            if (!bvid && !aid) { cb(null, '未找到 BV/AV 号'); return; }
            var primaryApi = 'https://api.bilibili.com/x/web-interface/view?';
            var backupApi = 'https://api.bilibili.com/x/web-interface/view?';
            var thirdApi = 'https://api.bilibili.com/x/web-interface/view/detail?';
            if (bvid) {
                primaryApi += 'bvid=' + encodeURIComponent(bvid);
                backupApi += 'bvid=' + encodeURIComponent(bvid);
                thirdApi += 'bvid=' + encodeURIComponent(bvid);
            } else {
                primaryApi += 'aid=' + aid;
                backupApi += 'aid=' + aid;
                thirdApi += 'aid=' + aid;
            }
            if (typeof GM_xmlhttpRequest === 'function') {
                var parseVideoData = function(data, isDetail) {
                    var videoData = isDetail && data.data ? (data.data.View || data.data) : data.data;
                    if (!videoData) return null;
                    var stat = videoData.stat || {};
                    var result = {
                        title: videoData.title || '',
                        cover: videoData.pic || '',
                        duration: videoData.duration || 0,
                        owner: videoData.owner ? videoData.owner.name : '',
                        ownerFace: videoData.owner ? videoData.owner.face : '',
                        ownerMid: videoData.owner ? videoData.owner.mid : '',
                        aid: videoData.aid,
                        bvid: videoData.bvid,
                        cid: videoData.cid,
                        desc: videoData.desc || '',
                        pages: videoData.pages || [],
                        siteIcon: '📺',
                        siteName: '哔哩哔哩',
                        viewCount: stat.view || 0,
                        likeCount: stat.like || 0,
                        coinCount: stat.coin || 0,
                        favoriteCount: stat.favorite || 0,
                        replyCount: stat.reply || 0,
                        danmakuCount: stat.danmaku || 0,
                        shareCount: stat.share || 0,
                        play: stat.view || 0,
                        like: stat.like || 0,
                        coin: stat.coin || 0,
                        favorite: stat.favorite || 0,
                        reply: stat.reply || 0,
                        danmaku: stat.danmaku || 0,
                        share: stat.share || 0,
                        pubdate: videoData.pubdate || 0,
                        qualityDescriptions: {
                            127: '8K 超高清',
                            126: '杜比视界',
                            125: 'HDR 真彩色',
                            120: '4K 超清',
                            116: '1080P 60帧',
                            112: '1080P+ 高码率',
                            80: '1080P 高清',
                            74: '720P 60帧',
                            64: '720P 高清',
                            32: '480P 清晰',
                            16: '360P 流畅',
                            6: '240P 极速'
                        }
                    };
                    result.currentQn = 64;
                    return result;
                };
                var fetchVideoInfo = function(infoApiUrl, apiIndex, isDetail) {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: infoApiUrl,
                        responseType: 'json',
                        timeout: VideoResolver._timeout,
                        headers: {
                            'Referer': 'https://www.bilibili.com/',
                            'User-Agent': 'Mozilla/5.0'
                        },
                        onload: function(resp) {
                            try {
                                var data = resp.response;
                                if (typeof data === 'string') data = JSON.parse(data);
                                var result = parseVideoData(data, isDetail);
                                if (result) {
                                    if (result.cid) {
                                        VideoResolver._fetchPlayUrl({
                                            bvid: bvid,
                                            aid: result.aid,
                                            cid: result.cid,
                                            qn: 64,
                                            result: result,
                                            cb: cb,
                                            useBackup: false
                                        });
                                    } else {
                                        cb(result, null);
                                    }
                                } else {
                                    if (apiIndex === 0) {
                                        fetchVideoInfo(backupApi, 1, false);
                                    } else if (apiIndex === 1) {
                                        fetchVideoInfo(thirdApi, 2, true);
                                    } else {
                                        var errInfo = VideoResolver._classifyError(data, 'api');
                                        cb(null, errInfo.message);
                                    }
                                }
                            } catch(e) {
                                if (apiIndex === 0) {
                                    fetchVideoInfo(backupApi, 1, false);
                                } else if (apiIndex === 1) {
                                    fetchVideoInfo(thirdApi, 2, true);
                                } else {
                                    cb(null, e.message);
                                }
                            }
                        },
                        onerror: function() {
                            if (apiIndex === 0) {
                                fetchVideoInfo(backupApi, 1, false);
                            } else if (apiIndex === 1) {
                                fetchVideoInfo(thirdApi, 2, true);
                            } else {
                                cb(null, '网络请求失败');
                            }
                        },
                        ontimeout: function() {
                            if (apiIndex === 0) {
                                fetchVideoInfo(backupApi, 1, false);
                            } else if (apiIndex === 1) {
                                fetchVideoInfo(thirdApi, 2, true);
                            } else {
                                cb(null, '请求超时');
                            }
                        }
                    });
                };
                fetchVideoInfo(primaryApi, 0, false);
            } else {
                cb(null, '需要 Tampermonkey 环境');
            }
        } catch(e) { cb(null, e.message); }
    };

    VideoResolver._resolveDouyin = function(pageUrl, cb, attempt) {
        attempt = attempt || 0;
        try {
            var videoIdMatch = pageUrl.match(/\/video\/(\d+)/i) || pageUrl.match(/\/note\/(\d+)/i);
            var videoId = videoIdMatch ? videoIdMatch[1] : '';
            if (!videoId) { cb(null, '未找到抖音视频ID'); return; }
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: pageUrl,
                    headers: {
                        'Referer': 'https://www.douyin.com/',
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
                    },
                    onload: function(resp) {
                        try {
                            var html = resp.responseText || resp.response || '';
                            var renderData = null;
                            var renderMatch = html.match(/window\.__INIT_PROPS__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/i);
                            if (renderMatch) {
                                renderData = U.safeJson(renderMatch[1], null);
                            }
                            if (!renderData) {
                                var renderMatch2 = html.match(/RENDER_DATA\s*=\s*["']([^"']+)["']/i);
                                if (renderMatch2) {
                                    try {
                                        var decoded = decodeURIComponent(renderMatch2[1]);
                                        renderData = U.safeJson(decoded, null);
                                    } catch(e) {}
                                }
                            }
                            var result = {
                                title: '',
                                cover: '',
                                videoUrl: '',
                                duration: 0,
                                author: '',
                                siteIcon: '🎵',
                                siteName: '抖音',
                                videoId: videoId,
                                viewCount: 0,
                                likeCount: 0,
                                commentCount: 0,
                                shareCount: 0
                            };
                            var videoInfo = null;
                            if (renderData) {
                                try {
                                    var initialData = renderData.initialData || renderData;
                                    if (initialData.video) {
                                        videoInfo = initialData.video;
                                    } else if (initialData.itemInfo && initialData.itemInfo.itemStruct) {
                                        videoInfo = initialData.itemInfo.itemStruct;
                                    } else {
                                        for (var key in initialData) {
                                            if (initialData[key] && initialData[key].video) {
                                                videoInfo = initialData[key].video;
                                                break;
                                            }
                                        }
                                    }
                                } catch(e) {}
                            }
                            if (videoInfo) {
                                result.title = videoInfo.desc || videoInfo.title || '';
                                if (videoInfo.cover) {
                                    if (typeof videoInfo.cover === 'string') {
                                        result.cover = videoInfo.cover;
                                    } else if (videoInfo.cover.url_list && videoInfo.cover.url_list.length > 0) {
                                        result.cover = videoInfo.cover.url_list[0];
                                    } else if (videoInfo.cover.origin_cover && videoInfo.cover.origin_cover.url_list && videoInfo.cover.origin_cover.url_list.length > 0) {
                                        result.cover = videoInfo.cover.origin_cover.url_list[0];
                                    } else if (videoInfo.cover.dynamic_cover && videoInfo.cover.dynamic_cover.url_list && videoInfo.cover.dynamic_cover.url_list.length > 0) {
                                        result.cover = videoInfo.cover.dynamic_cover.url_list[0];
                                    }
                                }
                                if (videoInfo.author) {
                                    result.author = videoInfo.author.nickname || videoInfo.author.unique_id || '';
                                }
                                if (videoInfo.duration) {
                                    result.duration = Math.floor(videoInfo.duration / 1000);
                                }
                                if (videoInfo.statistics) {
                                    result.viewCount = videoInfo.statistics.play_count || videoInfo.statistics.view_count || 0;
                                    result.likeCount = videoInfo.statistics.digg_count || videoInfo.statistics.like_count || 0;
                                    result.commentCount = videoInfo.statistics.comment_count || 0;
                                    result.shareCount = videoInfo.statistics.share_count || 0;
                                } else if (videoInfo.stats) {
                                    result.viewCount = videoInfo.stats.playCount || videoInfo.stats.viewCount || 0;
                                    result.likeCount = videoInfo.stats.diggCount || videoInfo.stats.likeCount || 0;
                                    result.commentCount = videoInfo.stats.commentCount || 0;
                                    result.shareCount = videoInfo.stats.shareCount || 0;
                                } else {
                                    result.viewCount = videoInfo.play_count || videoInfo.view_count || videoInfo.playCount || videoInfo.viewCount || 0;
                                    result.likeCount = videoInfo.digg_count || videoInfo.like_count || videoInfo.diggCount || videoInfo.likeCount || 0;
                                    result.commentCount = videoInfo.comment_count || videoInfo.commentCount || 0;
                                    result.shareCount = videoInfo.share_count || videoInfo.shareCount || 0;
                                }
                                if (videoInfo.video) {
                                    var v = videoInfo.video;
                                    if (v.play_addr && v.play_addr.url_list && v.play_addr.url_list.length > 0) {
                                        result.videoUrl = v.play_addr.url_list[0];
                                    } else if (v.play_addr_h264 && v.play_addr_h264.url_list && v.play_addr_h264.url_list.length > 0) {
                                        result.videoUrl = v.play_addr_h264.url_list[0];
                                    }
                                    if (!result.cover && v.cover && v.cover.url_list && v.cover.url_list.length > 0) {
                                        result.cover = v.cover.url_list[0];
                                    }
                                }
                                if (result.videoUrl) {
                                    cb(result, null);
                                } else {
                                    result.error = '无法获取真实视频地址';
                                    cb(result, null);
                                }
                            } else {
                                cb(null, '解析抖音视频信息失败');
                            }
                        } catch(e) { cb(null, e.message); }
                    },
                    onerror: function() {
                        cb(null, '网络请求失败');
                    },
                    ontimeout: function() {
                        cb(null, '请求超时');
                    }
                });
            } else {
                cb(null, '需要 Tampermonkey 环境');
            }
        } catch(e) { cb(null, e.message); }
    };

    VideoResolver._resolveKuaishou = function(pageUrl, cb, attempt) {
        attempt = attempt || 0;
        try {
            var videoIdMatch = pageUrl.match(/\/short-video\/([^/?#]+)/i) || pageUrl.match(/\/video\/([^/?#]+)/i);
            var videoId = videoIdMatch ? videoIdMatch[1] : '';
            if (!videoId) { cb(null, '未找到快手视频ID'); return; }
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: pageUrl,
                    headers: {
                        'Referer': 'https://www.kuaishou.com/',
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
                    },
                    onload: function(resp) {
                        try {
                            var html = resp.responseText || resp.response || '';
                            var apolloData = null;
                            var apolloMatch = html.match(/window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/i);
                            if (apolloMatch) {
                                apolloData = U.safeJson(apolloMatch[1], null);
                            }
                            var result = {
                                title: '',
                                cover: '',
                                videoUrl: '',
                                duration: 0,
                                author: '',
                                siteIcon: '⚡',
                                siteName: '快手',
                                videoId: videoId,
                                viewCount: 0,
                                likeCount: 0,
                                commentCount: 0,
                                shareCount: 0
                            };
                            var videoInfo = null;
                            if (apolloData) {
                                try {
                                    for (var key in apolloData) {
                                        if (apolloData.hasOwnProperty(key)) {
                                            var item = apolloData[key];
                                            if (item && (item.photoUrl || item.coverUrl || item.mp4Url) && (item.caption || item.description)) {
                                                videoInfo = item;
                                                break;
                                            }
                                        }
                                    }
                                    if (!videoInfo) {
                                        for (var k in apolloData) {
                                            if (apolloData.hasOwnProperty(k)) {
                                                var obj = apolloData[k];
                                                if (obj && typeof obj === 'object') {
                                                    for (var subKey in obj) {
                                                        if (obj.hasOwnProperty(subKey)) {
                                                            var subItem = obj[subKey];
                                                            if (subItem && (subItem.photoUrl || subItem.coverUrl || subItem.mp4Url)) {
                                                                videoInfo = subItem;
                                                                break;
                                                            }
                                                        }
                                                    }
                                                    if (videoInfo) break;
                                                }
                                            }
                                        }
                                    }
                                } catch(e) {}
                            }
                            if (!videoInfo) {
                                var titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                                if (titleMatch) {
                                    result.title = titleMatch[1].trim();
                                }
                                var coverMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
                                if (coverMatch) {
                                    result.cover = coverMatch[1];
                                }
                                if (result.title || result.cover) {
                                    result.error = '无法获取真实视频地址';
                                    cb(result, null);
                                } else {
                                    cb(null, '解析快手视频信息失败');
                                }
                                return;
                            }
                            result.title = videoInfo.caption || videoInfo.description || videoInfo.title || '';
                            if (videoInfo.coverUrl) {
                                result.cover = videoInfo.coverUrl;
                            } else if (videoInfo.cover && videoInfo.cover.url) {
                                result.cover = videoInfo.cover.url;
                            } else if (videoInfo.thumbnailUrl) {
                                result.cover = videoInfo.thumbnailUrl;
                            } else if (videoInfo.photoUrl) {
                                result.cover = videoInfo.photoUrl;
                            }
                            if (videoInfo.mp4Url) {
                                result.videoUrl = videoInfo.mp4Url;
                            } else if (videoInfo.mainMvUrls && videoInfo.mainMvUrls.length > 0) {
                                result.videoUrl = videoInfo.mainMvUrls[0];
                            } else if (videoInfo.video && videoInfo.video.url) {
                                result.videoUrl = videoInfo.video.url;
                            }
                            if (videoInfo.duration) {
                                result.duration = Math.floor(videoInfo.duration / 1000);
                            } else if (videoInfo.timestamp) {
                                result.duration = Math.floor(videoInfo.timestamp / 1000);
                            }
                            if (videoInfo.userName) {
                                result.author = videoInfo.userName;
                            } else if (videoInfo.user && videoInfo.user.name) {
                                result.author = videoInfo.user.name;
                            } else if (videoInfo.user && videoInfo.user.userName) {
                                result.author = videoInfo.user.userName;
                            }
                            if (videoInfo.statistics) {
                                result.viewCount = videoInfo.statistics.viewCount || videoInfo.statistics.view_count || videoInfo.statistics.playCount || videoInfo.statistics.play_count || 0;
                                result.likeCount = videoInfo.statistics.likeCount || videoInfo.statistics.like_count || videoInfo.statistics.likedCount || 0;
                                result.commentCount = videoInfo.statistics.commentCount || videoInfo.statistics.comment_count || 0;
                                result.shareCount = videoInfo.statistics.shareCount || videoInfo.statistics.share_count || 0;
                            } else if (videoInfo.stats) {
                                result.viewCount = videoInfo.stats.viewCount || videoInfo.stats.view_count || videoInfo.stats.playCount || videoInfo.stats.play_count || 0;
                                result.likeCount = videoInfo.stats.likeCount || videoInfo.stats.like_count || videoInfo.stats.likedCount || 0;
                                result.commentCount = videoInfo.stats.commentCount || videoInfo.stats.comment_count || 0;
                                result.shareCount = videoInfo.stats.shareCount || videoInfo.stats.share_count || 0;
                            } else {
                                result.viewCount = videoInfo.viewCount || videoInfo.view_count || videoInfo.playCount || videoInfo.play_count || videoInfo.view_count || 0;
                                result.likeCount = videoInfo.likeCount || videoInfo.like_count || videoInfo.likedCount || videoInfo.liked_count || 0;
                                result.commentCount = videoInfo.commentCount || videoInfo.comment_count || 0;
                                result.shareCount = videoInfo.shareCount || videoInfo.share_count || 0;
                            }
                            if (result.videoUrl) {
                                cb(result, null);
                            } else {
                                result.error = '无法获取真实视频地址';
                                cb(result, null);
                            }
                        } catch(e) { cb(null, e.message); }
                    },
                    onerror: function() {
                        cb(null, '网络请求失败');
                    },
                    ontimeout: function() {
                        cb(null, '请求超时');
                    }
                });
            } else {
                cb(null, '需要 Tampermonkey 环境');
            }
        } catch(e) { cb(null, e.message); }
    };

    VideoResolver._resolveXiaohongshu = function(pageUrl, cb, attempt) {
        attempt = attempt || 0;
        try {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: pageUrl,
                    headers: {
                        'Referer': 'https://www.xiaohongshu.com/',
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
                    },
                    onload: function(resp) {
                        try {
                            var html = resp.responseText || resp.response || '';
                            var result = {
                                title: '',
                                cover: '',
                                videoUrl: '',
                                duration: 0,
                                author: '',
                                siteIcon: '📕',
                                siteName: '小红书'
                            };
                            var titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                            if (titleMatch) {
                                result.title = titleMatch[1].trim();
                            }
                            var coverMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
                            if (coverMatch) {
                                result.cover = coverMatch[1];
                            }
                            result.error = '暂不支持解析';
                            cb(result, null);
                        } catch(e) { cb(null, e.message); }
                    },
                    onerror: function() {
                        cb(null, '网络请求失败');
                    },
                    ontimeout: function() {
                        cb(null, '请求超时');
                    }
                });
            } else {
                cb(null, '需要 Tampermonkey 环境');
            }
        } catch(e) { cb(null, e.message); }
    };

    VideoResolver._resolveWeibo = function(pageUrl, cb, attempt) {
        attempt = attempt || 0;
        try {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: pageUrl,
                    headers: {
                        'Referer': 'https://weibo.com/',
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
                    },
                    onload: function(resp) {
                        try {
                            var html = resp.responseText || resp.response || '';
                            var result = {
                                title: '',
                                cover: '',
                                videoUrl: '',
                                duration: 0,
                                author: '',
                                siteIcon: '🌐',
                                siteName: '微博'
                            };
                            var titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                            if (titleMatch) {
                                result.title = titleMatch[1].trim();
                            }
                            var coverMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
                            if (coverMatch) {
                                result.cover = coverMatch[1];
                            }
                            result.error = '暂不支持解析';
                            cb(result, null);
                        } catch(e) { cb(null, e.message); }
                    },
                    onerror: function() {
                        cb(null, '网络请求失败');
                    },
                    ontimeout: function() {
                        cb(null, '请求超时');
                    }
                });
            } else {
                cb(null, '需要 Tampermonkey 环境');
            }
        } catch(e) { cb(null, e.message); }
    };

    VideoResolver._resolveZhihu = function(pageUrl, cb, attempt) {
        attempt = attempt || 0;
        try {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: pageUrl,
                    headers: {
                        'Referer': 'https://www.zhihu.com/',
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
                    },
                    onload: function(resp) {
                        try {
                            var html = resp.responseText || resp.response || '';
                            var result = {
                                title: '',
                                cover: '',
                                videoUrl: '',
                                duration: 0,
                                author: '',
                                siteIcon: '💡',
                                siteName: '知乎'
                            };
                            var titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                            if (titleMatch) {
                                result.title = titleMatch[1].trim();
                            }
                            var coverMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
                            if (coverMatch) {
                                result.cover = coverMatch[1];
                            }
                            result.error = '暂不支持解析';
                            cb(result, null);
                        } catch(e) { cb(null, e.message); }
                    },
                    onerror: function() {
                        cb(null, '网络请求失败');
                    },
                    ontimeout: function() {
                        cb(null, '请求超时');
                    }
                });
            } else {
                cb(null, '需要 Tampermonkey 环境');
            }
        } catch(e) { cb(null, e.message); }
    };

    VideoResolver._resolveWeixin = function(pageUrl, cb, attempt) {
        attempt = attempt || 0;
        try {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: pageUrl,
                    headers: {
                        'Referer': 'https://channels.weixin.qq.com/',
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
                    },
                    onload: function(resp) {
                        try {
                            var html = resp.responseText || resp.response || '';
                            var result = {
                                title: '',
                                cover: '',
                                videoUrl: '',
                                duration: 0,
                                author: '',
                                siteIcon: '💬',
                                siteName: '微信视频号'
                            };
                            var titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                            if (titleMatch) {
                                result.title = titleMatch[1].trim();
                            }
                            var coverMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
                            if (coverMatch) {
                                result.cover = coverMatch[1];
                            }
                            result.error = '暂不支持解析';
                            cb(result, null);
                        } catch(e) { cb(null, e.message); }
                    },
                    onerror: function() {
                        cb(null, '网络请求失败');
                    },
                    ontimeout: function() {
                        cb(null, '请求超时');
                    }
                });
            } else {
                cb(null, '需要 Tampermonkey 环境');
            }
        } catch(e) { cb(null, e.message); }
    };

    VideoResolver._fetchPlayUrl = function(opts) {
        var bvid = opts.bvid;
        var aid = opts.aid;
        var cid = opts.cid;
        var qn = opts.qn || 64;
        var result = opts.result;
        var cb = opts.cb;
        var useBackup = opts.useBackup || false;
        var apiIndex = opts.apiIndex !== undefined ? opts.apiIndex : (useBackup ? 1 : 0);
        var primaryPlayApi = 'https://api.bilibili.com/x/player/playurl?';
        var backupPlayApi = 'https://api.bilibili.com/x/player/wbi/playurl?';
        var thirdPlayApi = 'https://api.bilibili.com/x/player/playurl/v1?';
        var apiList = [primaryPlayApi, backupPlayApi, thirdPlayApi];
        var baseUrl = apiList[apiIndex] || primaryPlayApi;
        var playUrl = baseUrl;
        if (bvid) playUrl += 'bvid=' + bvid;
        else playUrl += 'avid=' + aid;
        playUrl += '&cid=' + cid + '&qn=' + qn + '&fnval=16&fourk=1';
        var tryNextApi = function() {
            var nextIndex = apiIndex + 1;
            if (nextIndex < apiList.length) {
                VideoResolver._fetchPlayUrl({
                    bvid: bvid,
                    aid: aid,
                    cid: cid,
                    qn: qn,
                    result: result,
                    cb: cb,
                    apiIndex: nextIndex
                });
                return true;
            }
            return false;
        };
        GM_xmlhttpRequest({
            method: 'GET',
            url: playUrl,
            responseType: 'json',
            timeout: VideoResolver._timeout,
            headers: {
                'Referer': 'https://www.bilibili.com/',
                'User-Agent': 'Mozilla/5.0'
            },
            onload: function(resp2) {
                try {
                    var pdata = resp2.response;
                    if (typeof pdata === 'string') pdata = JSON.parse(pdata);
                    if (pdata && pdata.data && pdata.data.durl && pdata.data.durl.length > 0) {
                        result.videoUrl = pdata.data.durl[0].url;
                        result.videoUrls = pdata.data.durl.map(function(d){ return d.url; });
                        result.quality = pdata.data.quality || '';
                        result.currentQn = pdata.data.quality || qn;
                        result.acceptQuality = pdata.data.accept_quality || [];
                        result.acceptDescription = pdata.data.accept_description || [];
                        result.qualityList = VideoResolver._buildQualityList(pdata.data, result.qualityDescriptions);
                        cb(result, null);
                    } else if (pdata && pdata.data && pdata.data.dash) {
                        var dash = pdata.data.dash;
                        if (dash.video && dash.video.length > 0) {
                            var sortedVideos = dash.video.slice().sort(function(a, b) {
                                return (b.id || 0) - (a.id || 0);
                            });
                            result.videoUrl = sortedVideos[0].baseUrl || sortedVideos[0].base_url || '';
                            result.videoQualities = sortedVideos.map(function(v) {
                                return {
                                    quality: v.id,
                                    qn: v.id,
                                    desc: result.qualityDescriptions[v.id] || (v.height + 'P'),
                                    url: v.baseUrl || v.base_url || '',
                                    height: v.height,
                                    width: v.width,
                                    codecs: v.codecs || ''
                                };
                            });
                            result.qualityList = result.videoQualities;
                        }
                        if (dash.audio && dash.audio.length > 0) {
                            var sortedAudios = dash.audio.slice().sort(function(a, b) {
                                return (b.bandwidth || 0) - (a.bandwidth || 0);
                            });
                            result.audioUrl = sortedAudios[0].baseUrl || sortedAudios[0].base_url || '';
                            result.audioQualities = sortedAudios.map(function(a) {
                                return {
                                    id: a.id,
                                    url: a.baseUrl || a.base_url || '',
                                    label: (a.bandwidth ? Math.round(a.bandwidth / 1000) + 'kbps' : '音频')
                                };
                            });
                        }
                        result.isDash = true;
                        result.acceptQuality = sortedVideos ? sortedVideos.map(function(v) { return v.id; }) : [];
                        result.currentQn = pdata.data.quality || qn;
                        result.quality = pdata.data.quality || '';
                        result.dash = dash;
                        cb(result, null);
                    } else if (pdata && pdata.code !== 0) {
                        if (!tryNextApi()) {
                            var errInfo = VideoResolver._classifyError(pdata, 'api');
                            result.error = errInfo.message;
                            cb(result, null);
                        }
                        return;
                    } else {
                        if (!tryNextApi()) {
                            cb(result, null);
                        }
                        return;
                    }
                } catch(e) {
                    if (!tryNextApi()) {
                        cb(result, null);
                    }
                }
            },
            onerror: function() {
                if (!tryNextApi()) {
                    cb(result, null);
                }
            },
            ontimeout: function() {
                if (!tryNextApi()) {
                    cb(result, null);
                }
            }
        });
    };

    VideoResolver._buildQualityList = function(playData, qualityDescriptions) {
        var list = [];
        var acceptQuality = playData.accept_quality || [];
        var acceptDescription = playData.accept_description || [];
        for (var i = 0; i < acceptQuality.length; i++) {
            var qn = acceptQuality[i];
            var desc = acceptDescription[i] || qualityDescriptions[qn] || ('清晰度 ' + qn);
            list.push({
                quality: qn,
                qn: qn,
                desc: desc
            });
        }
        return list;
    };

    VideoResolver.getQualityList = function(data) {
        if (!data || !data.qualityList) return [];
        return data.qualityList;
    };

    VideoResolver.switchQuality = function(data, qn, cb) {
        if (!data || !data.bvid || !data.cid) {
            cb(null, '缺少必要的视频信息');
            return;
        }
        var newResult = {};
        VideoResolver._fetchPlayUrl({
            bvid: data.bvid,
            aid: data.aid,
            cid: data.cid,
            qn: qn,
            result: newResult,
            cb: function(newData, err) {
                if (newData && newData.videoUrl) {
                    data.videoUrl = newData.videoUrl;
                    data.videoUrls = newData.videoUrls || data.videoUrls;
                    data.quality = newData.quality;
                    data.currentQn = newData.currentQn;
                    data.qualityList = newData.qualityList || data.qualityList;
                    if (newData.audioUrl) data.audioUrl = newData.audioUrl;
                    if (newData.isDash) data.isDash = newData.isDash;
                    if (newData.dash) data.dash = newData.dash;
                    if (newData.videoQualities) data.videoQualities = newData.videoQualities;
                    if (newData.audioQualities) data.audioQualities = newData.audioQualities;
                    if (newData.acceptQuality) data.acceptQuality = newData.acceptQuality;
                    cb(data, null);
                } else {
                    cb(null, err || '切换画质失败');
                }
            },
            useBackup: false
        });
    };

    VideoResolver.batchResolve = function(urls, cb, progressCb) {
        var results = {};
        var errors = {};
        var total = urls.length;
        var completed = 0;
        var successCount = 0;
        var failedCount = 0;
        var index = 0;
        var concurrent = VideoResolver._maxConcurrent;

        if (total === 0) {
            cb({ results: results, errors: errors }, null);
            return;
        }

        var next = function() {
            if (index >= total) return;
            var currentIndex = index;
            index++;
            var url = urls[currentIndex];
            VideoResolver.resolve(url, function(data, err) {
                completed++;
                if (data) {
                    results[url] = data;
                    successCount++;
                } else {
                    errors[url] = err;
                    failedCount++;
                }
                if (progressCb) {
                    progressCb(completed, total, successCount, failedCount);
                }
                if (completed >= total) {
                    cb({ results: results, errors: errors }, null);
                } else {
                    next();
                }
            });
        };

        for (var i = 0; i < Math.min(concurrent, total); i++) {
            next();
        }
    };

    // =========================================================================
    // 🎬 模块 6c：视频链接预览 (Video Link Preview)
    // =========================================================================
    var VideoLinkPreview = {};
    VideoLinkPreview._cache = {};

    // 核心方法1：解析视频链接，返回元数据
    VideoLinkPreview.resolve = function(url, cb) {
        if (cb) {
            VideoResolver.resolve(url, function(data, err) {
                if (data) {
                    VideoLinkPreview._cache[url] = data;
                    cb(data, null);
                } else {
                    cb(null, err || '解析失败');
                }
            });
        } else {
            return new Promise(function(resolve, reject) {
                VideoLinkPreview.resolve(url, function(data, err) {
                    if (data) resolve(data);
                    else reject(err ? new Error(err) : new Error('解析失败'));
                });
            });
        }
    };

    // 核心方法2：一键预览（解析成功后自动弹出预览窗口）
    VideoLinkPreview.preview = function(url) {
        VideoLinkPreview.resolve(url, function(data, err) {
            if (err) {
                VideoLinkPreview.showModal({
                    _error: err,
                    _url: url,
                    title: '解析失败',
                    siteIcon: '⚠️',
                    siteName: ''
                });
                return;
            }
            data._url = url;
            VideoLinkPreview.showModal(data);
        });
    };

    function _formatNumber(num) {
        if (num === undefined || num === null || num === '') return '-';
        num = Number(num) || 0;
        if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿';
        if (num >= 10000) return (num / 10000).toFixed(1) + '万';
        return String(num);
    }

    function _formatPubDate(timestamp) {
        if (!timestamp) return '';
        var d = new Date(timestamp * 1000);
        var now = new Date();
        var diff = (now - d) / 1000;
        if (diff < 60) return '刚刚';
        if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
        if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
        if (diff < 2592000) return Math.floor(diff / 86400) + '天前';
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    // 显示预览弹窗
    VideoLinkPreview.showModal = function(data) {
        var c = UI.colors();
        var isMobile = window.innerWidth < 768;

        var overlay = document.createElement('div');
        overlay.id = '_ms_vlp_overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:2147483647;display:flex;align-items:' + (isMobile ? 'flex-end' : 'center') + ';justify-content:center;padding:' + (isMobile ? '0' : '20px') + ';';

        var width = isMobile ? window.innerWidth : Math.min(720, window.innerWidth - 40);
        var modal = document.createElement('div');
        modal.id = '_ms_vlp_modal';
        modal.style.cssText = 'background:' + c.bg + ';border-radius:' + (isMobile ? '16px 16px 0 0' : '16px') + ';max-width:' + width + 'px;width:100%;max-height:' + (isMobile ? '92vh' : '90vh') + ';overflow-y:auto;box-shadow:0 25px 80px rgba(0,0,0,0.5);transition:transform 0.3s ease, opacity 0.3s ease;' + (isMobile ? 'padding-bottom:env(safe-area-inset-bottom);' : '');

        var siteIcon = data.siteIcon || '📺';
        var siteName = data.siteName || '';
        var title = data.title || '未知标题';
        var owner = data.owner || '';
        var ownerFace = data.ownerFace || '';
        var cover = data.cover || '';
        var videoUrl = data.videoUrl || (data.videoUrls && data.videoUrls[0]) || '';
        var audioUrl = data.audioUrl || '';
        var currentVideoUrl = videoUrl;
        var qualityList = data.qualityList || [];
        var videoQualities = data.videoQualities || [];
        var isDash = data.isDash || false;
        var pages = data.pages || [];
        var currentPageIndex = 0;
        var resolveError = data._error || '';
        var originalUrl = data._url || '';

        function buildQualityOptions() {
            if (!qualityList || qualityList.length === 0) return '';
            var options = '';
            for (var i = 0; i < qualityList.length; i++) {
                var q = qualityList[i];
                var selected = (q.url === currentVideoUrl || (data.videoUrls && data.videoUrls[i] === currentVideoUrl)) ? 'selected' : '';
                options += '<option value="' + i + '" ' + selected + '>' + (q.label || ('清晰度 ' + i)) + '</option>';
            }
            return options;
        }

        function buildStatsHtml() {
            var stats = [];
            if (data.viewCount !== undefined) stats.push('<span title="播放量">▶️ ' + _formatNumber(data.viewCount) + '</span>');
            if (data.likeCount !== undefined) stats.push('<span title="点赞">👍 ' + _formatNumber(data.likeCount) + '</span>');
            if (data.coinCount !== undefined) stats.push('<span title="投币">🪙 ' + _formatNumber(data.coinCount) + '</span>');
            if (data.favoriteCount !== undefined) stats.push('<span title="收藏">⭐ ' + _formatNumber(data.favoriteCount) + '</span>');
            if (data.replyCount !== undefined) stats.push('<span title="评论">💬 ' + _formatNumber(data.replyCount) + '</span>');
            if (stats.length === 0) return '';
            return '<div style="display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:' + c.sub + ';margin-bottom:10px;">' + stats.join('') + '</div>';
        }

        function buildUploaderHtml() {
            var parts = [];
            if (ownerFace) {
                parts.push('<img src="' + ownerFace + '" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">');
            }
            if (owner) {
                parts.push('<span style="font-size:13px;color:' + c.txt + ';font-weight:500;">' + owner + '</span>');
            }
            if (data.pubdate) {
                parts.push('<span style="font-size:11px;color:' + c.sub + ';">📅 ' + _formatPubDate(data.pubdate) + '</span>');
            }
            if (parts.length === 0) return '';
            return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid ' + c.border + ';margin-top:8px;">' + parts.join('') + '</div>';
        }

        function buildVideoInfoHtml() {
            var rows = [];
            if (data.bvid) {
                rows.push('<span>📺 BV号: <code style="background:' + c.bg + ';padding:2px 6px;border-radius:4px;">' + data.bvid + '</code></span>');
            }
            if (data.duration) {
                rows.push('<span>⏱ 时长: ' + Math.floor(data.duration / 60) + ':' + String(data.duration % 60).padStart(2, '0') + '</span>');
            }
            if (rows.length === 0) return '';
            return '<div style="background:' + c.bg2 + ';border-radius:10px;padding:12px 16px;font-size:12px;color:' + c.sub + ';line-height:1.8;">' +
                '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">' + rows.join('') + '</div>' +
            '</div>';
        }

        function buildQualitySelectorHtml() {
            if (!qualityList || qualityList.length === 0) return '';
            return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
                '<span style="font-size:12px;color:' + c.sub + ';">画质:</span>' +
                '<select id="_ms_vlp_quality" style="padding:6px 10px;border:1px solid ' + c.border + ';border-radius:8px;background:' + c.bg + ';color:' + c.txt + ';font-size:12px;cursor:pointer;">' +
                    buildQualityOptions() +
                '</select>' +
                (isDash ? '<span style="font-size:11px;color:' + c.sub + ';">（DASH格式）</span>' : '') +
            '</div>';
        }

        function buildErrorHtml() {
            if (!resolveError) return '';
            return '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;margin-bottom:16px;text-align:center;">' +
                '<div style="font-size:32px;margin-bottom:8px;">⚠️</div>' +
                '<div style="font-size:14px;color:#dc2626;font-weight:500;margin-bottom:4px;">解析失败</div>' +
                '<div style="font-size:12px;color:#ef4444;margin-bottom:12px;">' + resolveError + '</div>' +
                (originalUrl ? '<button id="_ms_vlp_retry" style="padding:8px 20px;border:none;border-radius:8px;background:#ef4444;color:#fff;font-size:13px;font-weight:500;cursor:pointer;">🔄 重试</button>' : '') +
            '</div>';
        }

        modal.innerHTML =
            (isMobile ? '<div id="_ms_vlp_drag_handle" style="padding:12px 0 4px;display:flex;justify-content:center;cursor:grab;touch-action:none;">' +
                '<div style="width:40px;height:5px;border-radius:3px;background:' + c.bg3 + ';"></div>' +
                '</div>' : '') +
            '<div style="padding:' + (isMobile ? '8px 16px 12px' : '16px 20px') + ';border-bottom:1px solid ' + c.border + ';display:flex;align-items:center;justify-content:space-between;">' +
                '<div style="display:flex;align-items:center;gap:8px;font-size:' + (isMobile ? '15px' : '16px') + ';font-weight:600;color:' + c.txt + ';">' +
                    '<span style="font-size:20px;">' + siteIcon + '</span>' +
                    '<span>视频预览</span>' +
                    (siteName ? '<span style="font-size:12px;color:' + c.sub + ';">— ' + siteName + '</span>' : '') +
                '</div>' +
                '<button id="_ms_vlp_close" style="width:32px;height:32px;border:none;border-radius:8px;background:' + c.bg3 + ';color:' + c.txt + ';font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">×</button>' +
            '</div>' +

            '<div style="padding:' + (isMobile ? '12px 14px' : '20px') + ';">' +
                buildErrorHtml() +

                // 标题区域
                '<div style="margin-bottom:12px;">' +
                    '<h2 style="margin:0 0 8px;font-size:' + (isMobile ? '16px' : '18px') + ';color:' + c.txt + ';line-height:1.4;">' + title + '</h2>' +
                    buildStatsHtml() +
                '</div>' +

                // 视频播放器区域
                '<div id="_ms_vlp_player" style="background:#000;border-radius:12px;overflow:hidden;margin-bottom:12px;position:relative;touch-action:manipulation;">' +
                    (cover ? '<img id="_ms_vlp_cover" src="' + cover + '" style="width:100%;display:block;max-height:360px;object-fit:contain;">' : '') +
                    '<div id="_ms_vlp_loading" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-size:14px;">加载中...</div>' +
                    '<div id="_ms_vlp_video_error" style="display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);flex-direction:column;align-items:center;justify-content:center;color:#fff;padding:20px;text-align:center;">' +
                        '<div style="font-size:32px;margin-bottom:8px;">⚠️</div>' +
                        '<div id="_ms_vlp_error_msg" style="font-size:13px;margin-bottom:12px;">视频加载失败</div>' +
                        '<button id="_ms_vlp_video_retry" style="padding:6px 16px;border:none;border-radius:6px;background:#ef4444;color:#fff;font-size:12px;cursor:pointer;">🔄 重试</button>' +
                    '</div>' +
                '</div>' +

                // 画质选择
                buildQualitySelectorHtml() +

                // 视频信息
                buildVideoInfoHtml() +

                // UP主信息
                buildUploaderHtml() +

                // 操作按钮
                (isMobile ?
                '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px;margin-bottom:16px;">' +
                    '<button id="_ms_vlp_play" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 8px;border:none;border-radius:12px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:12px;font-weight:600;cursor:pointer;">' +
                        '<span style="font-size:22px;">▶️</span><span>播放</span>' +
                    '</button>' +
                    '<button id="_ms_vlp_dl" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 8px;border:none;border-radius:12px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-size:12px;font-weight:600;cursor:pointer;">' +
                        '<span style="font-size:22px;">📥</span><span>下载</span>' +
                    '</button>' +
                    '<button id="_ms_vlp_copy" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 8px;border:none;border-radius:12px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;font-size:12px;font-weight:600;cursor:pointer;">' +
                        '<span style="font-size:22px;">📋</span><span>复制</span>' +
                    '</button>' +
                '</div>' :
                '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;margin-bottom:16px;">' +
                    '<button id="_ms_vlp_play" style="flex:1;min-width:120px;padding:12px 20px;border:none;border-radius:10px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:14px;font-weight:600;cursor:pointer;">▶ 播放视频</button>' +
                    '<button id="_ms_vlp_dl" style="flex:1;min-width:120px;padding:12px 20px;border:none;border-radius:10px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-size:14px;font-weight:600;cursor:pointer;">📥 下载视频</button>' +
                    '<button id="_ms_vlp_copy" style="flex:1;min-width:120px;padding:12px 20px;border:none;border-radius:10px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;font-size:14px;font-weight:600;cursor:pointer;">📋 复制链接</button>' +
                '</div>') +

                // 链接显示
                '<div style="border-top:1px solid ' + c.border + ';padding-top:16px;">' +
                    '<div style="font-size:12px;color:' + c.sub + ';margin-bottom:6px;">视频地址</div>' +
                    '<div id="_ms_vlp_video_url_text" style="background:' + c.bg2 + ';border-radius:8px;padding:10px;font-size:11px;color:' + c.txt + ';word-break:break-all;max-height:80px;overflow-y:auto;font-family:monospace;">' + (videoUrl || '解析中...') + '</div>' +
                    (audioUrl ? '<div style="margin-top:8px;"><div style="font-size:12px;color:' + c.sub + ';margin-bottom:6px;">音频地址（DASH格式）</div><div style="background:' + c.bg2 + ';border-radius:8px;padding:10px;font-size:11px;color:' + c.txt + ';word-break:break-all;max-height:60px;overflow-y:auto;font-family:monospace;">' + audioUrl + '</div></div>' : '') +
                '</div>' +
            '</div>';

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        if (isMobile) {
            modal.style.transform = 'translateY(100%)';
            requestAnimationFrame(function() {
                modal.style.transition = 'transform 0.3s cubic-bezier(.22,1,.36,1)';
                modal.style.transform = 'translateY(0)';
            });
        }

        var playerDiv = document.getElementById('_ms_vlp_player');
        var loadingDiv = document.getElementById('_ms_vlp_loading');
        var coverImg = document.getElementById('_ms_vlp_cover');
        var videoErrorDiv = document.getElementById('_ms_vlp_video_error');
        var videoErrorMsg = document.getElementById('_ms_vlp_error_msg');
        var videoUrlText = document.getElementById('_ms_vlp_video_url_text');

        // 关闭按钮
        document.getElementById('_ms_vlp_close').onclick = function() {
            closeModal();
        };
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeModal();
        });

        function closeModal() {
            if (isMobile) {
                modal.style.transform = 'translateY(100%)';
                overlay.style.background = 'rgba(0,0,0,0)';
            } else {
                modal.style.opacity = '0';
                modal.style.transform = 'scale(0.95)';
                overlay.style.background = 'rgba(0,0,0,0)';
            }
            setTimeout(function() {
                overlay.remove();
            }, 300);
        }

        // 显示视频加载错误
        function showVideoError(msg) {
            if (videoErrorDiv) {
                videoErrorDiv.style.display = 'flex';
                if (videoErrorMsg) videoErrorMsg.textContent = msg || '视频加载失败';
            }
            if (loadingDiv) loadingDiv.style.display = 'none';
        }

        function hideVideoError() {
            if (videoErrorDiv) videoErrorDiv.style.display = 'none';
        }

        // 创建播放器
        var createPlayer = function() {
            if (loadingDiv) loadingDiv.remove();
            if (coverImg) coverImg.remove();
            hideVideoError();

            var oldVid = playerDiv.querySelector('video');
            if (oldVid) oldVid.remove();

            var vid = document.createElement('video');
            vid.controls = true;
            vid.autoplay = true;
            vid.style.cssText = 'width:100%;display:block;max-height:400px;';
            vid.setAttribute('playsinline', '');
            vid.setAttribute('webkit-playsinline', '');

            if (currentVideoUrl) {
                vid.src = currentVideoUrl;
                vid.onerror = function() {
                    showVideoError('视频加载失败，请尝试直接下载');
                };
                vid.onloadstart = function() {
                    hideVideoError();
                };
            } else {
                showVideoError('未获取到视频地址');
            }

            playerDiv.appendChild(vid);
            return vid;
        };

        // 切换画质
        function switchQuality(index) {
            var newUrl = '';
            if (videoQualities && videoQualities[index]) {
                newUrl = videoQualities[index].url;
            } else if (data.videoUrls && data.videoUrls[index]) {
                newUrl = data.videoUrls[index];
            }
            if (!newUrl || newUrl === currentVideoUrl) return;

            currentVideoUrl = newUrl;
            if (videoUrlText) videoUrlText.textContent = newUrl;

            var vid = playerDiv.querySelector('video');
            if (vid) {
                var currentTime = vid.currentTime;
                var wasPlaying = !vid.paused;
                vid.src = newUrl;
                vid.load();
                if (wasPlaying) {
                    vid.play().catch(function(){});
                }
            }
        }

        // 画质选择器事件
        var qualitySel = document.getElementById('_ms_vlp_quality');
        if (qualitySel) {
            qualitySel.addEventListener('change', function() {
                var idx = parseInt(qualitySel.value, 10);
                switchQuality(idx);
            });
        }

        // 视频重试按钮
        var videoRetryBtn = document.getElementById('_ms_vlp_video_retry');
        if (videoRetryBtn) {
            videoRetryBtn.addEventListener('click', function() {
                var vid = playerDiv.querySelector('video');
                if (vid) {
                    hideVideoError();
                    vid.load();
                } else {
                    createPlayer();
                }
            });
        }

        // 解析失败重试按钮
        var retryBtn = document.getElementById('_ms_vlp_retry');
        if (retryBtn && originalUrl) {
            retryBtn.addEventListener('click', function() {
                delete VideoLinkPreview._cache[originalUrl];
                overlay.remove();
                VideoLinkPreview.preview(originalUrl);
            });
        }

        // 播放按钮
        document.getElementById('_ms_vlp_play').onclick = function() {
            var vid = createPlayer();
            if (vid) {
                vid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(function() { vid.play().catch(function(){}); }, 100);
            }
        };

        // 下载按钮
        document.getElementById('_ms_vlp_dl').onclick = function() {
            if (!currentVideoUrl) {
                toast('视频地址不可用', '#f59e0b');
                return;
            }
            var name = title.replace(/[\\\/:\*\?"<>\|]/g, '_').substring(0, 100) + '.mp4';
            Dl.one(currentVideoUrl, name, State.config.batchRetry, State.config.customHeaders);
            toast('开始下载: ' + title.substring(0, 30), '#10b981');
        };

        // 复制链接按钮
        document.getElementById('_ms_vlp_copy').onclick = function() {
            var text = currentVideoUrl || '';
            if (!text) {
                toast('视频地址不可用', '#f59e0b');
                return;
            }
            copyText(text);
        };

        // ========== 触摸手势支持（仅移动端） ==========
        if (isMobile) {
            var dragHandle = document.getElementById('_ms_vlp_drag_handle');
            var touchStartX = 0;
            var touchStartY = 0;
            var touchStartTime = 0;
            var lastTapTime = 0;
            var isDragging = false;
            var dragDirection = null;
            var SWIPE_THRESHOLD = 50;
            var TAP_MAX_DURATION = 300;
            var DOUBLE_TAP_DELAY = 300;

            function getCurrentQualityIndex() {
                var sel = document.getElementById('_ms_vlp_quality');
                if (sel) return parseInt(sel.value, 10);
                return 0;
            }

            if (dragHandle) {
                dragHandle.addEventListener('touchstart', function(e) {
                    if (e.touches.length !== 1) return;
                    var touch = e.touches[0];
                    touchStartX = touch.clientX;
                    touchStartY = touch.clientY;
                    touchStartTime = Date.now();
                    isDragging = true;
                    dragDirection = null;
                    modal.style.transition = 'none';
                    try { e.preventDefault(); } catch (e2) {}
                }, { passive: false });

                dragHandle.addEventListener('touchmove', function(e) {
                    if (!isDragging || e.touches.length !== 1) return;
                    var touch = e.touches[0];
                    var deltaX = touch.clientX - touchStartX;
                    var deltaY = touch.clientY - touchStartY;

                    if (!dragDirection) {
                        if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
                            dragDirection = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
                        }
                    }

                    if (dragDirection === 'vertical' && deltaY > 0) {
                        var translateY = Math.min(deltaY, window.innerHeight * 0.6);
                        var opacity = Math.max(0, 1 - deltaY / (window.innerHeight * 0.6));
                        modal.style.transform = 'translateY(' + translateY + 'px)';
                        overlay.style.background = 'rgba(0,0,0,' + (0.85 * opacity) + ')';
                        try { e.preventDefault(); } catch (e2) {}
                    }
                }, { passive: false });

                dragHandle.addEventListener('touchend', function(e) {
                    if (!isDragging) return;
                    isDragging = false;
                    modal.style.transition = 'transform 0.3s cubic-bezier(.22,1,.36,1)';

                    var touch = e.changedTouches[0];
                    var deltaY = touch.clientY - touchStartY;
                    var deltaTime = Date.now() - touchStartTime;

                    if (dragDirection === 'vertical' && (deltaY > SWIPE_THRESHOLD * 2 || deltaY > window.innerHeight * 0.25)) {
                        closeModal();
                        return;
                    }

                    if (dragDirection === 'vertical' && deltaY > 0) {
                        modal.style.transform = 'translateY(0)';
                        overlay.style.background = '';
                    }
                }, { passive: true });
            }

            if (playerDiv) {
                playerDiv.addEventListener('touchstart', function(e) {
                    if (e.touches.length !== 1) return;
                    var touch = e.touches[0];
                    touchStartX = touch.clientX;
                    touchStartY = touch.clientY;
                    touchStartTime = Date.now();
                    isDragging = true;
                    dragDirection = null;
                }, { passive: true });

                playerDiv.addEventListener('touchmove', function(e) {
                    if (!isDragging || e.touches.length !== 1) return;
                    var touch = e.touches[0];
                    var deltaX = touch.clientX - touchStartX;
                    var deltaY = touch.clientY - touchStartY;

                    if (!dragDirection) {
                        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
                            dragDirection = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
                        }
                    }
                }, { passive: true });

                playerDiv.addEventListener('touchend', function(e) {
                    if (!isDragging) return;
                    isDragging = false;

                    var touch = e.changedTouches[0];
                    var deltaX = touch.clientX - touchStartX;
                    var deltaY = touch.clientY - touchStartY;
                    var deltaTime = Date.now() - touchStartTime;

                    if (dragDirection === 'horizontal' && Math.abs(deltaX) > SWIPE_THRESHOLD) {
                        var qIdx = getCurrentQualityIndex();
                        var totalQ = qualityList && qualityList.length ? qualityList.length : (data.videoUrls ? data.videoUrls.length : 0);
                        if (totalQ > 1) {
                            var newIdx = qIdx;
                            if (deltaX < 0 && qIdx < totalQ - 1) {
                                newIdx = qIdx + 1;
                            } else if (deltaX > 0 && qIdx > 0) {
                                newIdx = qIdx - 1;
                            }
                            if (newIdx !== qIdx) {
                                switchQuality(newIdx);
                                var qSel = document.getElementById('_ms_vlp_quality');
                                if (qSel) qSel.value = newIdx;
                                toast('画质: ' + (qualityList && qualityList[newIdx] && qualityList[newIdx].label ? qualityList[newIdx].label : ('清晰度 ' + (newIdx + 1))), '#6366f1');
                            }
                        }
                        return;
                    }

                    if (deltaTime < TAP_MAX_DURATION && Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
                        var now = Date.now();
                        if (now - lastTapTime < DOUBLE_TAP_DELAY) {
                            var vid = playerDiv.querySelector('video');
                            if (vid) {
                                if (vid.paused) {
                                    vid.play().catch(function(){});
                                } else {
                                    vid.pause();
                                }
                            }
                            lastTapTime = 0;
                        } else {
                            lastTapTime = now;
                        }
                    }
                }, { passive: true });
            }
        }

        function switchPage(index) {
            if (!pages || !pages[index]) return;
            var page = pages[index];
            toast('切换到 P' + (index + 1) + ': ' + (page.part || ''), '#6366f1');
        }
    };

    // =========================================================================
    // 📊 模块 7：元信息提取 (Meta Fetcher - P1-2)
    // =========================================================================
    var Meta = {};
    // 获取文件大小（通过 HEAD 请求 Content-Length）
    Meta.fetchSize = function (url, cb) {
        if (State.metaCache[url] && State.metaCache[url].size) { cb(State.metaCache[url].size, null); return; }
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('HEAD', url, true);
            xhr.timeout = 10000;
            xhr.onload = function () {
                var size = 0;
                try { size = parseInt(xhr.getResponseHeader('Content-Length') || '0', 10); } catch (e) {}
                if (!State.metaCache[url]) State.metaCache[url] = {};
                State.metaCache[url].size = size;
                cb(size > 0 ? size : null, null);
            };
            xhr.onerror = function () { cb(null, '网络错误'); };
            xhr.ontimeout = function () { cb(null, '超时'); };
            xhr.send();
        } catch (e) { cb(null, e.message); }
    };

    // 获取图片尺寸（通过加载图片）
    Meta.fetchImageSize = function (url, cb) {
        if (State.metaCache[url] && State.metaCache[url].width) { cb(State.metaCache[url].width, State.metaCache[url].height, null); return; }
        try {
            var img = new Image();
            img.onload = function () {
                if (!State.metaCache[url]) State.metaCache[url] = {};
                State.metaCache[url].width = img.naturalWidth || img.width;
                State.metaCache[url].height = img.naturalHeight || img.height;
                cb(img.naturalWidth || img.width, img.naturalHeight || img.height, null);
            };
            img.onerror = function () { cb(null, null, '加载失败'); };
            img.src = url;
        } catch (e) { cb(null, null, e.message); }
    };

    // 获取视频时长（通过加载 video 元素）
    Meta.fetchVideoDuration = function (url, cb) {
        if (State.metaCache[url] && State.metaCache[url].duration) { cb(State.metaCache[url].duration, null); return; }
        try {
            var v = document.createElement('video');
            v.preload = 'metadata';
            v.onloadedmetadata = function () {
                if (!State.metaCache[url]) State.metaCache[url] = {};
                State.metaCache[url].duration = v.duration;
                cb(v.duration, null);
                v.src = '';
            };
            v.onerror = function () { cb(null, '加载失败'); };
            v.src = url;
        } catch (e) { cb(null, e.message); }
    };

    // 获取音频时长
    Meta.fetchAudioDuration = function (url, cb) {
        if (State.metaCache[url] && State.metaCache[url].duration) { cb(State.metaCache[url].duration, null); return; }
        try {
            var a = document.createElement('audio');
            a.preload = 'metadata';
            a.onloadedmetadata = function () {
                if (!State.metaCache[url]) State.metaCache[url] = {};
                State.metaCache[url].duration = a.duration;
                cb(a.duration, null);
                a.src = '';
            };
            a.onerror = function () { cb(null, '加载失败'); };
            a.src = url;
        } catch (e) { cb(null, e.message); }
    };

    // 批量获取元信息（用于筛选）
    Meta.batchFetch = function (urls, kind, progressCb, doneCb) {
        var total = urls.length;
        var done = 0;
        var results = {};
        var concurrency = 5;

        function worker(idx) {
            if (idx >= total) {
                if (done >= total) doneCb(results);
                return;
            }
            var url = urls[idx];
            var next = function () { done++; if (progressCb) progressCb(done, total); worker(idx + concurrency); };

            if (kind === 'image') {
                Meta.fetchImageSize(url, function (w, h, err) {
                    results[url] = { width: w, height: h, error: err };
                    next();
                });
            } else if (kind === 'video') {
                Meta.fetchVideoDuration(url, function (dur, err) {
                    results[url] = { duration: dur, error: err };
                    next();
                });
            } else if (kind === 'audio') {
                Meta.fetchAudioDuration(url, function (dur, err) {
                    results[url] = { duration: dur, error: err };
                    next();
                });
            } else {
                Meta.fetchSize(url, function (size, err) {
                    results[url] = { size: size, error: err };
                    next();
                });
            }
        }
        for (var w = 0; w < concurrency; w++) worker(w);
    };

    // 高级筛选（P1-3）
    Meta.filterResources = function (urls, kind) {
        var cfg = State.config;
        var filtered = [];
        for (var i = 0; i < urls.length; i++) {
            var url = urls[i];
            var meta = State.metaCache[url] || {};
            var pass = true;

            if (kind === 'image') {
                // 图片大小筛选
                if (cfg.minImageSize > 0 && meta.size && meta.size < cfg.minImageSize) pass = false;
                if (cfg.minImageWidth > 0 && meta.width && meta.width < cfg.minImageWidth) pass = false;
                if (cfg.minImageHeight > 0 && meta.height && meta.height < cfg.minImageHeight) pass = false;
            } else if (kind === 'video') {
                if (cfg.minVideoDuration > 0 && meta.duration && meta.duration < cfg.minVideoDuration) pass = false;
                if (cfg.maxVideoDuration > 0 && meta.duration && meta.duration > cfg.maxVideoDuration) pass = false;
            } else if (kind === 'audio') {
                if (cfg.minAudioDuration > 0 && meta.duration && meta.duration < cfg.minAudioDuration) pass = false;
            }

            if (pass) filtered.push(url);
        }
        LOG.info('筛选结果:', kind, '原始', urls.length, '过滤后', filtered.length);
        return filtered;
    };

    // =========================================================================
    // 🌐 模块 8：翻译引擎 (Translator)
    // =========================================================================
    var Translator = {};
    Translator.LANG_MAP = {
        'zh-CN': 'zh-CN', 'zh': 'zh-CN', 'en': 'en', 'auto': 'auto',
        'ja': 'ja', 'ko': 'ko', 'fr': 'fr', 'de': 'de', 'es': 'es', 'ru': 'ru',
    };
    Translator.translate = function (text, fromLang, toLang, cb) {
        if (!text || !text.trim()) { if (cb) cb('', null); return; }
        var cacheKey = (fromLang || State.config.translateFrom) + '|' + (toLang || State.config.translateTo) + '|' + text.substring(0, 100);
        if (State.translateCache[cacheKey]) { if (cb) cb(State.translateCache[cacheKey], null); return; }
        var f = Translator.LANG_MAP[fromLang || State.config.translateFrom] || 'auto';
        var t = Translator.LANG_MAP[toLang || State.config.translateTo] || 'zh-CN';
        var pair = encodeURIComponent(f) + '%7C' + encodeURIComponent(t);
        var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text.substring(0, 500)) + '&langpair=' + pair;
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.timeout = 25000;
            xhr.onreadystatechange = function () {
                try {
                    if (xhr.readyState !== 4) return;
                    if (xhr.status >= 200 && xhr.status < 300) {
                        var data = U.safeJson(xhr.responseText, null);
                        var result = '';
                        if (data && data.responseData && data.responseData.translatedText) result = data.responseData.translatedText;
                        else if (data && data.data && data.data.translations && data.data.translations[0]) result = data.data.translations[0].translatedText;
                        if (!result) { if (cb) cb(null, LANG.t('transFail')); return; }
                        State.translateCache[cacheKey] = result;
                        if (cb) cb(result, null);
                    } else if (cb) cb(null, LANG.t('transFail') + ' (' + xhr.status + ')');
                } catch (err) { if (cb) cb(null, LANG.t('transFail') + ': ' + err.message); }
            };
            xhr.onerror = function () { if (cb) cb(null, LANG.t('transFail')); };
            xhr.ontimeout = function () { if (cb) cb(null, LANG.t('transFail')); };
            xhr.send();
        } catch (e) { if (cb) cb(null, LANG.t('transFail') + ': ' + e.message); }
    };
    Translator.autoTranslate = function (text, cb) {
        var hasChinese = /[\u4e00-\u9fa5]/.test(text || '');
        Translator.translate(text, hasChinese ? 'zh-CN' : 'en', hasChinese ? 'en' : 'zh-CN', cb);
    };

    // =========================================================================
    // 🔎 模块 9：DOM 扫描器 (Scanner) + requestIdleCallback 分批处理
    // =========================================================================
    var Scanner = {};
    Scanner.scanImages = function () {
        var urls = [];
        try {
            var imgs = document.getElementsByTagName('img');
            for (var i = 0; i < imgs.length; i++) {
                var src = imgs[i].getAttribute('src') || imgs[i].getAttribute('data-src') || imgs[i].getAttribute('data-original') || imgs[i].getAttribute('data-lazy-src') || '';
                if (src && SEC.isSafeUrl(src)) urls.push(SEC.absUrl(src));
            }
            var links = document.getElementsByTagName('a');
            for (var j = 0; j < links.length; j++) {
                var href = links[j].getAttribute('href') || '';
                if (/^[^?#]+\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?|#|$)/i.test(href) && SEC.isSafeUrl(href)) urls.push(SEC.absUrl(href));
            }
        } catch (e) {}
        return urls;
    };
    Scanner.scanVideos = function () {
        var urls = [];
        try {
            var vs = document.querySelectorAll('video, video source');
            for (var i = 0; i < vs.length; i++) {
                var s = vs[i].getAttribute('src') || '';
                if (s && SEC.isSafeUrl(s)) urls.push(SEC.absUrl(s));
            }
            var links = document.querySelectorAll('a[href]');
            for (var j = 0; j < links.length; j++) {
                var href = links[j].getAttribute('href') || '';
                if (/^[^?#]+\.(mp4|webm|mov|mkv|avi|flv|ts|m4v|3gp)(\?|#|$)/i.test(href) && SEC.isSafeUrl(href)) urls.push(SEC.absUrl(href));
            }
        } catch (e) {}
        return urls;
    };
    Scanner.scanAudios = function () {
        var urls = [];
        try {
            var auds = document.querySelectorAll('audio, audio source');
            for (var i = 0; i < auds.length; i++) {
                var s = auds[i].getAttribute('src') || '';
                if (s && SEC.isSafeUrl(s)) urls.push(SEC.absUrl(s));
            }
            var links = document.getElementsByTagName('a');
            for (var j = 0; j < links.length; j++) {
                var href = links[j].getAttribute('href') || '';
                if (/^[^?#]+\.(mp3|wav|flac|aac|oga|opus|m4a|wma|amr|ape)(\?|#|$)/i.test(href) && SEC.isSafeUrl(href)) urls.push(SEC.absUrl(href));
            }
        } catch (e) {}
        return urls;
    };
    Scanner.scanM3u8 = function () {
        var urls = [];
        try {
            var vs = document.querySelectorAll('video, audio, source, a[href]');
            for (var i = 0; i < vs.length; i++) {
                var s = vs[i].getAttribute('src') || '';
                if (vs[i].tagName === 'A' && !s) s = vs[i].getAttribute('href') || '';
                if (s && /\.m3u8?(\?|#|$)/i.test(s) && SEC.isSafeUrl(s)) urls.push(SEC.absUrl(s));
            }
        } catch (e) {}
        return urls;
    };

    Scanner.scanVideoLinks = function () {
        var results = [];
        var seen = {};
        try {
            var links = document.querySelectorAll('a[href]');
            for (var i = 0; i < links.length; i++) {
                var a = links[i];
                var href = a.getAttribute('href') || '';
                if (!href || href.indexOf('#') === 0) continue;
                var absUrl = SEC.absUrl(href);
                var site = SEC.detectVideoSite(absUrl);
                if (!site || seen[absUrl]) continue;
                seen[absUrl] = true;
                var title = '';
                var cover = '';
                try {
                    var img = a.querySelector('img');
                    if (img) {
                        cover = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') || '';
                        if (cover) cover = SEC.absUrl(cover);
                    }
                    var titleEl = a.querySelector('[title], .title, .name, .desc, h3, h4, p');
                    if (titleEl) {
                        title = titleEl.getAttribute('title') || titleEl.textContent || '';
                    }
                    if (!title) {
                        title = a.getAttribute('title') || a.textContent || '';
                    }
                    title = title.trim().replace(/\s+/g, ' ');
                    if (title.length > 80) title = title.substring(0, 77) + '...';
                } catch(e) {}
                results.push({
                    url: absUrl,
                    site: site.key,
                    siteName: site.name,
                    siteIcon: site.icon,
                    title: title || SEC.nameFromUrl(absUrl),
                    cover: cover
                });
            }
        } catch (e) {}
        return results;
    };

    // CSS background 扫描（分批处理避免阻塞）
    Scanner.scanBackgroundsAsync = function (cb) {
        var urls = [];
        var all = document.getElementsByTagName('*');
        var limit = Math.min(all.length, 3000);
        var batchSize = 200;
        var idx = 0;
        var re = /url\(\s*(["']?)([^"')]+)\1\s*\)/;

        function batch() {
            var end = Math.min(idx + batchSize, limit);
            for (var i = idx; i < end; i++) {
                try {
                    var bg = getComputedStyle(all[i]).backgroundImage;
                    if (!bg || bg === 'none' || bg.indexOf('url(') < 0) continue;
                    var m = bg.match(re);
                    if (!m || !m[2]) continue;
                    var url = m[2].trim();
                    if (SEC.isSafeUrl(url)) {
                        var abs = SEC.absUrl(url);
                        if (SEC.guessKind(abs) === 'image') urls.push(abs);
                    }
                } catch (ee) {}
            }
            idx = end;
            if (idx < limit) U.rIC(batch, { timeout: 50 });
            else cb(urls);
        }
        U.rIC(batch, { timeout: 50 });
    };

    Scanner.doFull = function (cb) {
        LOG.info('开始全量扫描...');
        var imgUrls = Scanner.scanImages();
        var vidUrls = Scanner.scanVideos();
        var audUrls = Scanner.scanAudios();
        var m3u8Urls = Scanner.scanM3u8();
        var vidLinks = Scanner.scanVideoLinks();
        Scanner.scanBackgroundsAsync(function (bgImgs) {
            State.images = U.uniq(imgUrls.concat(bgImgs).concat(Array.from(NetState.hits).filter(function (u) { return SEC.guessKind(u) === 'image'; })));
            State.videos = U.uniq(vidUrls.concat(Array.from(NetState.hits).filter(function (u) { return SEC.guessKind(u) === 'video'; })));
            State.audios = U.uniq(audUrls.concat(Array.from(NetState.hits).filter(function (u) { return SEC.guessKind(u) === 'audio'; })));
            State.m3u8 = U.uniq(m3u8Urls.concat(Array.from(NetState.hits).filter(function (u) { return SEC.guessKind(u) === 'm3u8'; })));
            State.videoLinks = vidLinks;
            LOG.info('扫描完成: 图片', State.images.length, '视频', State.videos.length, '音频', State.audios.length, 'm3u8', State.m3u8.length, '视频链接', State.videoLinks.length);
            if (cb) cb();
            if (State.config.enableSync) State._broadcast({ type: 'resources', data: { images: State.images, videos: State.videos, audios: State.audios, m3u8: State.m3u8, videoLinks: State.videoLinks } });
        });
    };

    // =========================================================================
    // ⬇ 模块 10：下载引擎 (Downloader) + 进度可视化 (P0-3)
    // =========================================================================
    var Dl = {};
    Dl.buildName = function (url, idx, ext, tpl) {
        var template = tpl || State.config.nameTpl;
        var finalExt = ext || SEC.extFromUrl(url) || 'bin';
        var out = template
            .replace(/\{域名\}/gi, U.getHost())
            .replace(/\{日期\}/gi, U.dateStr())
            .replace(/\{序号\}/gi, String(idx).padStart(3, '0'))
            .replace(/\{后缀\}/gi, finalExt)
            .replace(/\{文件名\}/gi, SEC.nameFromUrl(url));
        return SEC.safeFilename(out) + (out.indexOf('.' + finalExt) === -1 && !/\.([a-z0-9]{1,8})$/i.test(out) ? '.' + finalExt : '');
    };

    // 单个下载（支持自定义请求头 P1-4）
    Dl.one = function (url, name, retry, headers) {
        var tries = retry == null ? State.config.batchRetry : retry;
        var customHeaders = headers || State.config.customHeaders || {};
        try {
            if (typeof GM_download === 'function') {
                try {
                    GM_download({
                        url: url,
                        name: name,
                        headers: customHeaders.Referer ? { Referer: customHeaders.Referer } : undefined,
                        onerror: function () {
                            if (tries > 0) setTimeout(function () { Dl.one(url, name, tries - 1, headers); }, 600);
                            else Dl.fallback(url, name, headers);
                        }
                    });
                    return;
                } catch (ge) {}
            }
            Dl.fallback(url, name, headers);
        } catch (e) { Dl.fallback(url, name, headers); }
    };

    Dl.fallback = function (url, name, headers) {
        try {
            var a = document.createElement('a');
            a.href = url; a.download = name || ''; a.target = '_blank'; a.rel = 'noopener';
            (document.documentElement || document.body).appendChild(a);
            try { a.click(); } catch (e) { try { window.open(url, '_blank'); } catch (e2) {} }
            setTimeout(function () { try { a.remove(); } catch (e) {} }, 400);
        } catch (e) { try { window.open(url, '_blank'); } catch (e2) {} }
    };

    // 批量下载（含进度可视化）
    Dl.batch = function (urls, kind, progressCb, doneCb) {
        if (!urls || urls.length === 0) { toast(LANG.t('noDlResource'), '#f59e0b'); return; }
        if (State.downloading) { toast(LANG.t('downloading'), '#f59e0b'); return; }
        State.downloading = true;
        var concurrency = Math.max(1, Math.min(8, State.config.batchConcurrency));
        var idx = 0, done = 0, failed = 0;
        var total = urls.length;
        var startTime = U.now();
        var lastUpdate = startTime;
        var lastDone = 0;

        // 进度对象
        State.downloadProgress = { total: total, done: 0, failed: 0, speed: 0, eta: 0 };
        toast(LANG.t('batchStart', {n: total, c: concurrency}));

        function updateProgress() {
            var now = U.now();
            var elapsed = now - lastUpdate;
            if (elapsed > 500) {
                var speed = (done - lastDone) / (elapsed / 1000); // 每秒完成数
                var remaining = total - done;
                var eta = speed > 0 ? remaining / speed : 0;
                State.downloadProgress.done = done;
                State.downloadProgress.failed = failed;
                State.downloadProgress.speed = speed;
                State.downloadProgress.eta = eta;
                lastUpdate = now;
                lastDone = done;
                if (progressCb) progressCb(State.downloadProgress);
            }
        }

        function worker() {
            if (idx >= total) {
                if (running === 0) {
                    State.downloading = false;
                    State.downloadProgress = null;
                    var elapsed = (U.now() - startTime) / 1000;
                    toast(LANG.t('batchDone', {ok: total - failed, total: total, fail: failed, t: elapsed.toFixed(1)}));
                    if (doneCb) doneCb({ total: total, success: total - failed, failed: failed, elapsed: elapsed });
                }
                return;
            }
            var curIdx = idx++;
            running++;
            var url = urls[curIdx];
            var kindNow = kind || SEC.guessKind(url);
            var fileName = Dl.buildName(url, curIdx + 1, '', State.config.nameTpl);
            try {
                if (kindNow === 'm3u8') {
                    // m3u8 使用新的下载器
                    M3U8.downloadAndMerge(url, { quality: State.config.m3u8Quality, concurrency: State.config.m3u8Concurrency },
                        function (segDone, segTotal, segFailed) {
                            // m3u8 进度更新
                            updateProgress();
                        },
                        function (mergedData, err) {
                            running--;
                            if (err) {
                                failed++;
                                LOG.warn('m3u8 下载失败:', err);
                            } else {
                                // 保存合并后的文件
                                if (mergedData && mergedData.length > 0) {
                                    var blob = new Blob([mergedData], { type: 'video/mp2t' });
                                    var blobUrl = URL.createObjectURL(blob);
                                    Dl.fallback(blobUrl, fileName, null);
                                    LOG.info('m3u8 合并完成:', mergedData.length, '字节');
                                }
                                done++;
                            }
                            updateProgress();
                            if (!stopped) worker();
                        }
                    );
                } else {
                    Dl.one(url, fileName, State.config.batchRetry, State.config.customHeaders);
                    done++;
                    updateProgress();
                    setTimeout(worker, State.config.batchDelay);
                    running--;
                }
            } catch (e) {
                failed++;
                running--;
                setTimeout(worker, State.config.batchDelay);
            }
        }
        var running = 0, stopped = false;
        for (var w = 0; w < concurrency; w++) setTimeout(worker, w * 100);
    };

    // 停止下载（P1-5）
    Dl.stop = function () {
        State.downloading = false;
        State.downloadProgress = null;
        toast(LANG.t('dlStopped'));
    };

    // 生成下载脚本（跨域兜底 P0-4）
    Dl.generateScript = function (urls, format) {
        // format: 'curl' | 'wget' | 'aria2' | 'python'
        var script = '';
        var timestamp = U.dateStr();
        var domain = U.getHost();

        if (format === 'aria2') {
            script = '# aria2 批量下载脚本\n# 使用方法: aria2c -i download.txt\n# 生成时间: ' + timestamp + '\n\n';
            for (var i = 0; i < urls.length; i++) {
                var url = urls[i];
                var name = Dl.buildName(url, i + 1, '', State.config.nameTpl);
                script += url + '\n';
                script += '  out=' + name + '\n';
                script += '  split=16\n';
                if (State.config.customHeaders.Referer) script += '  header="Referer: ' + State.config.customHeaders.Referer + '"\n';
                script += '\n';
            }
        } else if (format === 'wget') {
            script = '# wget 批量下载脚本\n# 使用方法: wget -i download.txt\n# 生成时间: ' + timestamp + '\n\n';
            script += '--user-agent="Mozilla/5.0"\n';
            if (State.config.customHeaders.Referer) script += '--referer="' + State.config.customHeaders.Referer + '"\n';
            script += '\n';
            for (var i = 0; i < urls.length; i++) {
                var url = urls[i];
                var name = Dl.buildName(url, i + 1, '', State.config.nameTpl);
                script += '-O "' + name + '"\n';
                script += url + '\n\n';
            }
        } else if (format === 'python') {
            script = '# Python 批量下载脚本\n# 使用方法: python download.py\n# 生成时间: ' + timestamp + '\n\n';
            script += 'import urllib.request\nimport os\n\nurls = [\n';
            for (var i = 0; i < urls.length; i++) script += '    "' + urls[i] + '",\n';
            script += ']\n\nheaders = {"User-Agent": "Mozilla/5.0"}\n';
            if (State.config.customHeaders.Referer) script += 'headers["Referer"] = "' + State.config.customHeaders.Referer + '"\n';
            script += '\nfor i, url in enumerate(urls):\n    name = "' + domain + '_' + timestamp + '_{:03d}.bin".format(i+1)\n    try:\n        req = urllib.request.Request(url, headers=headers)\n        with urllib.request.urlopen(req) as resp:\n            with open(name, "wb") as f: f.write(resp.read())\n        print("✅", name)\n    except Exception as e: print("❌", name, e)\n';
        } else {
            script = '# curl 批量下载脚本\n# 使用方法: bash download.sh\n# 生成时间: ' + timestamp + '\n\n';
            for (var i = 0; i < urls.length; i++) {
                var url = urls[i];
                var name = Dl.buildName(url, i + 1, '', State.config.nameTpl);
                script += 'curl -L -A "Mozilla/5.0"';
                if (State.config.customHeaders.Referer) script += ' -e "' + State.config.customHeaders.Referer + '"';
                script += ' -o "' + name + '" "' + url + '"\n';
            }
        }
        return script;
    };

    // =========================================================================
    // 🖼 模块 11：UI 面板 + 虚拟列表 (P0-2) + 进度条 + 媒体预览 (P1-1)
    // =========================================================================
    var UI = {};

    UI._thumbCache = {};
    UI._thumbExtracting = {};

    UI._extractVideoThumb = function (url, onSuccess, onError) {
        if (UI._thumbCache[url]) {
            if (onSuccess) onSuccess(UI._thumbCache[url]);
            return;
        }
        if (UI._thumbExtracting[url]) return;
        UI._thumbExtracting[url] = true;

        var done = false;
        var cleanup = function () {
            done = true;
            delete UI._thumbExtracting[url];
        };

        // 用 blob URL 方式提取封面，绕过 CORS 限制
        var extractFromBlob = function(blob) {
            if (done) return;
            try {
                var blobUrl = URL.createObjectURL(blob);
                var video = document.createElement('video');
                video.src = blobUrl;
                video.muted = true;
                video.playsInline = true;
                video.preload = 'auto';

                var innerDone = false;
                var innerCleanup = function() {
                    innerDone = true;
                    try { video.pause(); video.src = ''; video.load(); } catch(e){}
                    try { URL.revokeObjectURL(blobUrl); } catch(e){}
                };

                var onReady = function() {
                    if (innerDone || done) return;
                    try {
                        var canvas = document.createElement('canvas');
                        var w = video.videoWidth || 320;
                        var h = video.videoHeight || 180;
                        var maxW = 400;
                        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
                        canvas.width = w;
                        canvas.height = h;
                        var ctx = canvas.getContext('2d');
                        if (!ctx) { innerCleanup(); cleanup(); if (onError) onError(new Error('canvas context error')); return; }
                        ctx.drawImage(video, 0, 0, w, h);
                        var dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                        UI._thumbCache[url] = dataUrl;
                        innerCleanup();
                        cleanup();
                        if (onSuccess) onSuccess(dataUrl);
                    } catch (err) {
                        innerCleanup();
                        cleanup();
                        if (onError) onError(err);
                    }
                };

                video.addEventListener('loadeddata', function() {
                    if (innerDone || done) return;
                    try { video.currentTime = Math.min(1, (video.duration || 2) / 4); } catch(e) { onReady(); }
                });
                video.addEventListener('seeked', onReady);
                video.addEventListener('error', function() {
                    innerCleanup();
                    cleanup();
                    if (onError) onError(new Error('video decode error'));
                });
                setTimeout(function() {
                    if (!innerDone && !done) { innerCleanup(); cleanup(); if (onError) onError(new Error('timeout')); }
                }, 15000);
                video.load();
            } catch (err) {
                cleanup();
                if (onError) onError(err);
            }
        };

        // 优先使用 GM_xmlhttpRequest 获取 blob（绕过 CORS）
        if (typeof GM_xmlhttpRequest === 'function') {
            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    responseType: 'blob',
                    headers: { 'Range': 'bytes=0-524287', 'Referer': location.href },
                    onload: function(response) {
                        if (done) return;
                        if (response.status >= 200 && response.status < 300 && response.response) {
                            extractFromBlob(response.response);
                        } else {
                            cleanup();
                            if (onError) onError(new Error('http ' + response.status));
                        }
                    },
                    onerror: function() {
                        cleanup();
                        if (onError) onError(new Error('network error'));
                    },
                    ontimeout: function() {
                        cleanup();
                        if (onError) onError(new Error('timeout'));
                    }
                });
            } catch (err) {
                cleanup();
                if (onError) onError(err);
            }
        } else {
            // 降级：直接尝试用 video 标签加载
            cleanup();
            if (onError) onError(new Error('GM_xmlhttpRequest unavailable'));
        }
    };

    UI._loadVisibleVideoThumbs = function (container) {
        if (!container) return;
        var thumbs = container.querySelectorAll('._ms_v_thumb');
        if (!thumbs || thumbs.length === 0) return;
        var containerRect = container.getBoundingClientRect();
        var count = 0;
        for (var i = 0; i < thumbs.length; i++) {
            if (count >= 4) break;
            var el = thumbs[i];
            var url = el.getAttribute('data-url');
            if (!url || UI._thumbCache[url] || UI._thumbExtracting[url]) continue;
            var rect = el.getBoundingClientRect();
            var visible = rect.bottom > containerRect.top && rect.top < containerRect.bottom;
            if (visible) {
                count++;
                (function (elem, u) {
                    UI._extractVideoThumb(u, function (dataUrl) {
                        try {
                            var img = document.createElement('img');
                            img.src = dataUrl;
                            img.loading = 'lazy';
                            img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;';
                            img.onerror = function() {
                                var d = document.createElement('div');
                                d.style.cssText = 'width:100%;height:100%;background:linear-gradient(135deg,#1e293b,#334155);display:flex;align-items:center;justify-content:center;color:#fff;font-size:28px;';
                                d.textContent = '▶';
                                elem.parentNode.appendChild(d);
                            };
                            elem.parentNode.replaceChild(img, elem);
                        } catch (e) {}
                    });
                })(el, url);
            }
        }
    };

    UI._vlinkObserver = null;
    UI._vlinkResolving = {};
    UI._vlinkResolved = {};
    UI._vlinkScrollTimer = null;
    UI._vlinkIsScrolling = false;

    UI._initVlinkObserver = function() {
        if (UI._vlinkObserver) return;
        try {
            UI._vlinkObserver = new IntersectionObserver(function(entries) {
                for (var i = 0; i < entries.length; i++) {
                    var entry = entries[i];
                    var card = entry.target;
                    var url = card.getAttribute('data-vlink');
                    if (!url) continue;
                    if (entry.isIntersecting) {
                        card.classList.add('_ms_vlink_visible');
                        if (!UI._vlinkIsScrolling && !UI._vlinkResolved[url] && !UI._vlinkResolving[url]) {
                            UI._lazyResolveVlink(card, url);
                        }
                    } else {
                        card.classList.remove('_ms_vlink_visible');
                    }
                }
            }, { rootMargin: '100px', threshold: 0.1 });
        } catch (e) {
            UI._vlinkObserver = null;
        }
    };

    UI._lazyResolveVlink = function(card, url) {
        if (UI._vlinkResolved[url] || UI._vlinkResolving[url]) return;
        UI._vlinkResolving[url] = true;
        VideoResolver.resolve(url, function(data, err) {
            delete UI._vlinkResolving[url];
            if (data) {
                UI._vlinkResolved[url] = data;
                UI._updateVlinkCard(card, data);
            }
        });
    };

    UI._updateVlinkCard = function(card, data) {
        try {
            var c = UI.colors();
            var cover = data.cover || '';
            var title = data.title || '';
            var coverEl = card.querySelector('img');
            var firstChild = card.firstElementChild;
            var isPlaceholder = firstChild && firstChild.tagName === 'DIV' && firstChild.textContent === '🎬' && firstChild.style.width === '100%';
            if (cover && !coverEl && isPlaceholder) {
                var img = document.createElement('img');
                img.src = cover;
                img.loading = 'lazy';
                var h = firstChild.style.height || '90px';
                var iconSize = parseInt(h) >= 150 ? '36px' : '24px';
                img.style.cssText = 'width:100%;height:' + h + ';object-fit:cover;display:block;';
                img.onerror = function() {
                    var d = document.createElement('div');
                    d.style.cssText = 'width:100%;height:' + h + ';background:linear-gradient(135deg,#1e293b,#334155);display:flex;align-items:center;justify-content:center;color:#fff;font-size:' + iconSize + ';';
                    d.textContent = '🎬';
                    this.parentNode.replaceChild(d, this);
                };
                firstChild.parentNode.replaceChild(img, firstChild);
            }
            if (title) {
                var infoDiv = card.children[1];
                if (infoDiv) {
                    var titleDiv = infoDiv.firstElementChild;
                    if (titleDiv && titleDiv.style.overflow === 'hidden') {
                        titleDiv.textContent = title;
                    }
                }
            }
            var resolveBtn = card.querySelector('._ms_resolve_btn');
            if (resolveBtn) {
                resolveBtn.textContent = '✅ 已解析';
                resolveBtn.style.color = '#10b981';
            }
        } catch (e) {}
    };

    UI._observeVlinkCards = function(container) {
        if (!UI._vlinkObserver) UI._initVlinkObserver();
        if (!UI._vlinkObserver) return;
        var cards = container.querySelectorAll('[data-vlink]');
        for (var i = 0; i < cards.length; i++) {
            UI._vlinkObserver.observe(cards[i]);
        }
    };

    UI._unobserveVlinkCards = function(container) {
        if (!UI._vlinkObserver) return;
        var cards = container.querySelectorAll('[data-vlink]');
        for (var i = 0; i < cards.length; i++) {
            UI._vlinkObserver.unobserve(cards[i]);
        }
    };

    UI._onVlinkScrollStart = function() {
        UI._vlinkIsScrolling = true;
        var cards = document.querySelectorAll('[data-vlink]._ms_vlink_visible');
        for (var i = 0; i < cards.length; i++) {
            cards[i].classList.add('_ms_vlink_paused');
        }
    };

    UI._onVlinkScrollEnd = function() {
        UI._vlinkIsScrolling = false;
        var cards = document.querySelectorAll('[data-vlink]._ms_vlink_visible');
        for (var i = 0; i < cards.length; i++) {
            cards[i].classList.remove('_ms_vlink_paused');
            var url = cards[i].getAttribute('data-vlink');
            if (url && !UI._vlinkResolved[url] && !UI._vlinkResolving[url]) {
                UI._lazyResolveVlink(cards[i], url);
            }
        }
    };

    UI.batchResolveVlinks = function(vLinkList, progressCb, doneCb) {
        var urls = [];
        for (var i = 0; i < vLinkList.length; i++) {
            if (!UI._vlinkResolved[vLinkList[i].url]) {
                urls.push(vLinkList[i].url);
            }
        }
        if (urls.length === 0) {
            if (doneCb) doneCb(0, 0, 0);
            return;
        }
        var total = urls.length;
        var completed = 0;
        var successCount = 0;
        var failedCount = 0;
        var index = 0;
        var concurrent = VideoResolver._maxConcurrent || 3;

        function next() {
            if (index >= total) return;
            var currentIndex = index;
            index++;
            var url = urls[currentIndex];
            VideoResolver.resolve(url, function(data, err) {
                completed++;
                if (data) {
                    successCount++;
                    UI._vlinkResolved[url] = data;
                    var card = document.querySelector('[data-vlink="' + url + '"]');
                    if (card) UI._updateVlinkCard(card, data);
                } else {
                    failedCount++;
                }
                if (progressCb) progressCb(completed, total, successCount, failedCount);
                if (completed >= total) {
                    if (doneCb) doneCb(total, successCount, failedCount);
                } else {
                    next();
                }
            });
        }

        for (var j = 0; j < Math.min(concurrent, total); j++) {
            next();
        }
    };

    UI._isMobile = function() {
        try { return window.innerWidth < 768; } catch (e) { return false; }
    };

    UI._setupMobileGestures = function() {
        if (!UI._isMobile()) return;
        var btn = UI._floatBtn;
        if (!btn) return;

        var snapTimer = null;
        function snapToEdge() {
            if (snapTimer) clearTimeout(snapTimer);
            snapTimer = setTimeout(function() {
                var rect = btn.getBoundingClientRect();
                var btnW = rect.width;
                var btnH = rect.height;
                var viewW = window.innerWidth;
                var viewH = window.innerHeight;
                var centerX = rect.left + btnW / 2;
                var newLeft = centerX < viewW / 2 ? 4 : viewW - btnW - 4;
                var newTop = Math.max(4, Math.min(viewH - btnH - 4, rect.top));
                btn.style.transition = 'left 0.3s cubic-bezier(.22,1,.36,1), top 0.3s cubic-bezier(.22,1,.36,1)';
                btn.style.left = newLeft + 'px';
                btn.style.top = newTop + 'px';
                btn.style.right = 'auto';
                btn.style.bottom = 'auto';
                setTimeout(function() {
                    btn.style.transition = '';
                }, 300);
                if (State.config) {
                    State.config.btnPos = { x: newLeft, y: newTop };
                    try { State.save(); } catch (e) {}
                }
            }, 100);
        }

        var origUp = btn._msOrigUp;
        if (origUp) return;

        var touchEndHandler = function() {
            snapToEdge();
        };
        btn._msOrigUp = touchEndHandler;
        btn.addEventListener('touchend', touchEndHandler);
        btn.addEventListener('touchcancel', touchEndHandler);

        var panel = State.panel;
        if (panel) {
            var footer = document.getElementById('_ms_footer');
            if (footer) {
                footer.style.paddingBottom = 'calc(10px + env(safe-area-inset-bottom))';
            }
            var box = document.getElementById('_ms_box');
            if (box) {
                box.style.paddingBottom = 'env(safe-area-inset-bottom)';
            }
        }
    };

    // ---- 浮动按钮（极简可靠版） ----
    UI._floatBtn = null;

    // 全局注入按钮样式（只执行一次，GM_addStyle 优先级最高）
    try {
        if (typeof GM_addStyle === 'function') {
            GM_addStyle([
                '#_ms_float {',
                '  position: fixed !important;',
                '  right: 16px !important;',
                '  bottom: 20px !important;',
                '  z-index: 2147483647 !important;',
                '  width: 62px !important;',
                '  height: 62px !important;',
                '  border-radius: 50% !important;',
                '  border: none !important;',
                '  background: linear-gradient(135deg,#8b5cf6,#a855f7) !important;',
                '  color: #fff !important;',
                '  font-size: 28px !important;',
                '  font-weight: 700 !important;',
                '  text-align: center !important;',
                '  line-height: 62px !important;',
                '  cursor: pointer !important;',
                '  display: block !important;',
                '  visibility: visible !important;',
                '  opacity: 1 !important;',
                '  box-shadow: 0 8px 24px rgba(139,92,246,.6) !important;',
                '  user-select: none !important;',
                '  -webkit-user-select: none !important;',
                '  touch-action: manipulation !important;',
                '  -webkit-tap-highlight-color: transparent !important;',
                '  -webkit-appearance: none !important;',
                '  -moz-appearance: none !important;',
                '  appearance: none !important;',
                '  font-family: -apple-system, system-ui, "Apple Color Emoji", sans-serif !important;',
                '}',
                '#_ms_float:active {',
                '  transform: scale(0.92) !important;',
                '}',
            ].join('\n'));
        }
    } catch (e) {}

    UI.buildFloatBtn = function () {
        if (window.__ms_btn_built__) return;
        var existing = document.getElementById('_ms_float');
        if (existing) {
            UI._floatBtn = existing;
            window.__ms_btn_built__ = true;
            UI._startFloatGuard();
            return;
        }
        var exists = UI._floatBtn && document.body && document.body.contains(UI._floatBtn);
        console.log('[MS] buildFloatBtn 调用, 已存在:', !!UI._floatBtn, 'body存在:', !!document.body, 'contains:', exists);
        if (exists) {
            window.__ms_btn_built__ = true;
            return;
        }
        var host = document.body || document.documentElement;
        if (!host || host.nodeType !== 1) {
            console.log('[MS] buildFloatBtn: 宿主不存在，跳过');
            return;
        }

        try {
            var btn = document.createElement('div');
            btn.id = '_ms_float';
            btn.setAttribute('data-ms-btn', '1');
            btn.textContent = '\uD83C\uDFAF';

            // 恢复保存的位置
            if (State.config && State.config.btnPos && State.config.btnPos.x != null && State.config.btnPos.y != null) {
                var px = parseFloat(State.config.btnPos.x);
                var py = parseFloat(State.config.btnPos.y);
                if (!isNaN(px) && !isNaN(py) && px >= 0 && px < window.innerWidth - 30 && py >= 0 && py < window.innerHeight - 30) {
                    btn.style.left = px + 'px';
                    btn.style.top = py + 'px';
                    btn.style.right = 'auto';
                    btn.style.bottom = 'auto';
                } else {
                    State.config.btnPos = null;
                }
            }

            // 拖拽逻辑
            var dragging = false, moved = false, startX = 0, startY = 0, origX = 0, origY = 0;
            function onDown(e) {
                dragging = true; moved = false;
                var pt = e.touches ? e.touches[0] : e;
                startX = pt.clientX; startY = pt.clientY;
                var rect = btn.getBoundingClientRect();
                origX = rect.left; origY = rect.top;
                if (e.cancelable) { try { e.preventDefault(); } catch (e2) {} }
                try { e.stopPropagation(); } catch (e3) {}
            }
            function onMove(e) {
                if (!dragging) return;
                var pt = e.touches ? e.touches[0] : e;
                var dx = pt.clientX - startX, dy = pt.clientY - startY;
                if (!moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) moved = true;
                var nx = Math.max(4, Math.min(window.innerWidth - 66, origX + dx));
                var ny = Math.max(4, Math.min(window.innerHeight - 66, origY + dy));
                btn.style.left = nx + 'px'; btn.style.top = ny + 'px';
                btn.style.right = 'auto'; btn.style.bottom = 'auto';
                if (e.cancelable) { try { e.preventDefault(); } catch (e2) {} }
            }
            function onUp(e) {
                if (!dragging) return;
                dragging = false;
                if (moved) {
                    var x = parseFloat(btn.style.left);
                    var y = parseFloat(btn.style.top);
                    if (!isNaN(x) && !isNaN(y) && State.config) {
                        State.config.btnPos = { x: x, y: y };
                        try { State.save(); } catch (e2) {}
                    }
                } else {
                    try {
                        if (State.panelOpen) UI.closePanel();
                        else UI.openPanel();
                    } catch (e2) {}
                }
                if (e && e.cancelable) { try { e.preventDefault(); } catch (e3) {} }
            }

            btn.addEventListener('mousedown', onDown);
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            try { btn.addEventListener('touchstart', onDown, { passive: false }); } catch (e) { btn.addEventListener('touchstart', onDown); }
            try { btn.addEventListener('touchmove', onMove, { passive: false }); } catch (e) { btn.addEventListener('touchmove', onMove); }
            btn.addEventListener('touchend', onUp);

            host.appendChild(btn);
            UI._floatBtn = btn;
            window.__ms_btn_built__ = true;

            UI._startFloatGuard();
            UI._setupMobileGestures();

            console.log('[MS] 浮动按钮创建成功 ✓');

            LOG.info('浮动按钮创建成功 ✓');
        } catch (err) {
            console.log('[MS] 浮动按钮创建失败:', err.message);
            LOG.error('浮动按钮创建失败:', err.message);
        }
    };

    // 按钮守护：MutationObserver + 轮询双重保障
    UI._floatGuardRunning = false;
    UI._rebuildTimer = null;
    UI._startFloatGuard = function () {
        if (UI._floatGuardRunning) return;
        UI._floatGuardRunning = true;

        function scheduleRebuild() {
            if (UI._rebuildTimer) return;
            UI._rebuildTimer = setTimeout(function () {
                UI._rebuildTimer = null;
                UI._floatBtn = null;
                window.__ms_btn_built__ = false;
                UI.buildFloatBtn();
            }, 300);
        }

        try {
            var mo = new MutationObserver(function (mutations) {
                var btnRemoved = false;
                for (var i = 0; i < mutations.length; i++) {
                    var removed = mutations[i].removedNodes;
                    if (!removed) continue;
                    for (var j = 0; j < removed.length; j++) {
                        var node = removed[j];
                        if (node.id === '_ms_float' || (node.getAttribute && node.getAttribute('data-ms-btn') === '1')) {
                            btnRemoved = true;
                            break;
                        }
                    }
                    if (btnRemoved) break;
                }
                if (btnRemoved) {
                    LOG.warn('检测到浮动按钮被移除，300ms 后重建');
                    scheduleRebuild();
                }
            });
            mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
            LOG.info('浮动按钮 MutationObserver 守护已启动');
        } catch (e) { LOG.warn('MutationObserver 守护启动失败:', e.message); }

        var guardCount = 0;
        function pollGuard() {
            try {
                var exists = document.getElementById('_ms_float');
                if (!exists) {
                    LOG.warn('轮询检测到按钮缺失，重建中... 次数:', guardCount);
                    scheduleRebuild();
                }
            } catch (e) {
                try { scheduleRebuild(); } catch (e2) {}
            }
            guardCount++;
            var delay = guardCount < 10 ? 2000 : 5000;
            setTimeout(pollGuard, delay);
        }
        setTimeout(pollGuard, 1000);
        setTimeout(pollGuard, 3000);
    };

    UI.colors = function () {
        var dark = State.getTheme() === 'dark';
        return {
            bg: dark ? '#0f172a' : '#ffffff',
            bg2: dark ? '#1e293b' : '#f8fafc',
            bg3: dark ? '#334155' : '#e2e8f0',
            txt: dark ? '#e2e8f0' : '#0f172a',
            sub: dark ? '#94a3b8' : '#475569',
            border: dark ? '#334155' : '#e2e8f0',
            primary: '#6366f1',
            success: '#10b981',
            warn: '#f59e0b',
            danger: '#ef4444',
        };
    };

    // ===== 虚拟列表组件 =====
    UI.VirtualList = function (container, items, renderItem, itemHeight, overscan) {
        // container: DOM 元素
        // items: 数据数组
        // renderItem: function(item, index) => HTML string
        // itemHeight: 每项高度（px）
        // overscan: 预渲染数量
        var vh = itemHeight || 120;
        var os = overscan || 5;
        var scrollTop = 0;
        var viewportHeight = 0;
        var totalHeight = items.length * vh;
        var renderZone = null;

        function update() {
            try {
                viewportHeight = container.clientHeight || 400;
                var startIdx = Math.max(0, Math.floor(scrollTop / vh) - os);
                var endIdx = Math.min(items.length, Math.ceil((scrollTop + viewportHeight) / vh) + os);
                var offsetY = startIdx * vh;

                if (!renderZone) {
                    renderZone = document.createElement('div');
                    renderZone.style.cssText = 'position:absolute;top:0;left:0;right:0;';
                    container.appendChild(renderZone);
                }

                var html = '';
                for (var i = startIdx; i < endIdx; i++) {
                    html += renderItem(items[i], i);
                }
                renderZone.innerHTML = html;
                renderZone.style.top = offsetY + 'px';
                container.scrollTop = scrollTop;
            } catch (e) {}
        }

        container.style.position = 'relative';
        container.style.overflowY = 'auto';
        container.innerHTML = '<div style="height:' + totalHeight + 'px;"></div>';

        container.addEventListener('scroll', U.throttle(function () {
            scrollTop = container.scrollTop;
            update();
        }, 50));

        update();
        return { update: update, setItems: function (newItems) { items = newItems; totalHeight = items.length * vh; container.innerHTML = '<div style="height:' + totalHeight + 'px;"></div>'; renderZone = null; update(); } };
    };

    // ===== 构建面板 =====
    UI.buildPanel = function () {
        if (State.panel) return;
        var isMob = U.isMobile();
        var w = isMob ? Math.min(window.innerWidth, 520) : State.config.panelWidth;
        var c = UI.colors();
        State.panel = document.createElement('div');
        State.panel.id = '_ms_panel';
        State.panel.style.cssText = 'position:fixed;right:0;top:0;bottom:0;width:' + w + 'px;max-height:100vh;max-width:92vw;background:' + c.bg + ';color:' + c.txt + ';border-radius:' + (isMob ? '0' : '20px 0 0 20px') + ';box-shadow:-30px 0 60px rgba(0,0,0,.35);display:none;flex-direction:column;overflow:hidden;z-index:2147483645;transform:translateX(100%);transition:transform .35s cubic-bezier(.22,1,.36,1);font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;';

        // Header
        var hd = document.createElement('div');
        hd.style.cssText = 'display:flex;align-items:center;padding:12px 16px;background:linear-gradient(135deg,#6366f1,#8b5cf6 55%,#ec4899);color:#fff;flex-shrink:0;gap:8px;';
        hd.innerHTML = '<div style="flex:1;font-size:15px;font-weight:600;">' + LANG.t('appTitle') + '</div>';
        var closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = 'width:30px;height:30px;border-radius:50%;border:none;background:rgba(255,255,255,.25);color:#fff;font-size:20px;cursor:pointer;flex-shrink:0;';
        closeBtn.addEventListener('click', UI.closePanel);
        hd.appendChild(closeBtn);
        State.panel.appendChild(hd);

        // Tabs
        var tabBar = document.createElement('div');
        tabBar.id = '_ms_tabs';
        tabBar.style.cssText = 'display:flex;gap:4px;padding:8px 10px;background:' + c.bg2 + ';border-bottom:1px solid ' + c.border + ';overflow-x:auto;flex-shrink:0;';
        var tabs = [
            { key: 'img', label: LANG.t('tabImg') },
            { key: 'video', label: LANG.t('tabVideo') },
            { key: 'audio', label: LANG.t('tabAudio') },
            { key: 'm3u8', label: LANG.t('tabM3u8') },
            { key: 'translate', label: LANG.t('tabTranslate') },
            { key: 'cookie', label: LANG.t('tabCookie') },
            { key: 'storage', label: LANG.t('tabStorage') },
            { key: 'settings', label: LANG.t('tabSettings') },
        ];
        for (var i = 0; i < tabs.length; i++) {
            (function (t) {
                var btn = document.createElement('button');
                btn.className = '_ms_tab';
                btn.setAttribute('data-tab', t.key);
                btn.textContent = t.label;
                UI._applyTabStyle(btn, t.key === State.tab);
                btn.addEventListener('click', function () { UI.switchTab(t.key); });
                tabBar.appendChild(btn);
            })(tabs[i]);
        }
        State.panel.appendChild(tabBar);

        // 搜索栏
        var searchWrap = document.createElement('div');
        searchWrap.id = '_ms_search';
        searchWrap.style.cssText = 'padding:6px 12px;background:' + c.bg2 + ';border-bottom:1px solid ' + c.border + ';display:none;';
        var searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = LANG.t('searchPlaceholder');
        searchInput.style.cssText = 'width:100%;padding:7px 12px;border:1px solid ' + c.border + ';border-radius:8px;background:' + c.bg + ';color:' + c.txt + ';font-size:13px;font-family:inherit;box-sizing:border-box;';
        searchInput.addEventListener('input', U.debounce(function () {
            State.searchKeyword = this.value.trim().toLowerCase();
            State._renderThrottled();
        }, 250));
        searchWrap.appendChild(searchInput);
        State.panel.appendChild(searchWrap);

        // 高级筛选按钮
        var filterWrap = document.createElement('div');
        filterWrap.id = '_ms_filter';
        filterWrap.style.cssText = 'padding:4px 12px;background:' + c.bg2 + ';border-bottom:1px solid ' + c.border + ';display:none;';
        var filterBtn = document.createElement('button');
        filterBtn.textContent = LANG.t('advFilter');
        filterBtn.style.cssText = 'padding:6px 12px;border:none;border-radius:8px;background:' + c.bg3 + ';color:' + c.txt + ';font-size:12px;font-weight:600;cursor:pointer;';
        filterBtn.addEventListener('click', function () { UI.showFilterDialog(); });
        filterWrap.appendChild(filterBtn);
        State.panel.appendChild(filterWrap);

        // 进度条（下载时显示）
        var progressWrap = document.createElement('div');
        progressWrap.id = '_ms_progress';
        progressWrap.style.cssText = 'padding:8px 12px;background:' + c.bg2 + ';border-bottom:1px solid ' + c.border + ';display:none;';
        progressWrap.innerHTML = '<div style="font-size:12px;color:' + c.sub + ';margin-bottom:4px;">' + LANG.t('dlProgress') + '</div><div style="height:8px;background:' + c.bg3 + ';border-radius:4px;overflow:hidden;"><div id="_ms_progress_bar" style="height:100%;background:linear-gradient(135deg,#6366f1,#8b5cf6);width:0%;transition:width .3s;"></div></div><div id="_ms_progress_text" style="font-size:11px;color:' + c.sub + ';margin-top:4px;">0 / 0</div>';
        State.panel.appendChild(progressWrap);

        // 内容区
        var box = document.createElement('div');
        box.id = '_ms_box';
        box.style.cssText = 'flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;background:' + c.bg + (isMob ? ';padding-bottom:env(safe-area-inset-bottom);' : '');
        box.innerHTML = '<div style="padding:80px 20px;text-align:center;color:' + c.sub + ';font-size:14px;">' + LANG.t('clickTabScan') + '</div>';
        State.panel.appendChild(box);

        // 底部栏
        var footer = document.createElement('div');
        footer.id = '_ms_footer';
        footer.style.cssText = 'flex-shrink:0;padding:' + (isMob ? '10px 14px calc(10px + env(safe-area-inset-bottom))' : '10px 14px') + ';background:' + c.bg + ';border-top:1px solid ' + c.border + ';display:none;';
        State.panel.appendChild(footer);

        // 拖动调整宽度
        if (!isMob) {
            var dragBar = document.createElement('div');
            dragBar.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:6px;cursor:ew-resize;background:transparent;z-index:10;';
            var dragStartX = 0, dragStartW = 0, draggingPanel = false;
            dragBar.addEventListener('mousedown', function (e) { draggingPanel = true; dragStartX = e.clientX; dragStartW = State.panel.offsetWidth; e.preventDefault(); });
            document.addEventListener('mousemove', function (e) { if (!draggingPanel) return; var delta = dragStartX - e.clientX; var newW = Math.max(340, Math.min(900, dragStartW + delta)); State.panel.style.width = newW + 'px'; });
            document.addEventListener('mouseup', function () { if (draggingPanel) { draggingPanel = false; State.config.panelWidth = State.panel.offsetWidth; State.save(); } });
            State.panel.appendChild(dragBar);
        }

        document.documentElement.appendChild(State.panel);
    };

    UI._applyTabStyle = function (btn, active) {
        var c = UI.colors();
        btn.style.cssText = 'flex:1;min-width:60px;padding:8px 4px;border:none;border-radius:8px;background:' + (active ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : (State.getTheme() === 'dark' ? '#334155' : '#e2e8f0')) + ';color:' + (active ? '#fff' : c.sub) + ';font-size:12px;font-weight:' + (active ? '700' : '500') + ';cursor:pointer;white-space:nowrap;' + (active ? 'box-shadow:0 4px 12px rgba(99,102,241,.3);' : '');
    };

    UI.openPanel = function () {
        if (!State.panel) UI.buildPanel();
        State.panelOpen = true;
        State.panel.style.display = 'flex';
        requestAnimationFrame(function () { State.panel.style.transform = 'translateX(0)'; });
        var total = State.images.length + State.videos.length + State.audios.length + State.m3u8.length;
        if (total === 0) Scanner.doFull(function () { toast(LANG.t('scanDoneToast')); UI.switchTab(State.tab || 'img'); });
        else UI.switchTab(State.tab || 'img');
    };

    UI.closePanel = function () {
        if (!State.panel) return;
        State.panelOpen = false;
        State.panel.style.transform = 'translateX(100%)';
        setTimeout(function () { if (!State.panelOpen && State.panel) State.panel.style.display = 'none'; }, 400);
    };

    UI.switchTab = function (tab) {
        State.tab = tab;
        var tbs = document.querySelectorAll('._ms_tab');
        for (var i = 0; i < tbs.length; i++) UI._applyTabStyle(tbs[i], tbs[i].getAttribute('data-tab') === tab);
        var searchEl = document.getElementById('_ms_search');
        var filterEl = document.getElementById('_ms_filter');
        var footerEl = document.getElementById('_ms_footer');
        var progressEl = document.getElementById('_ms_progress');
        var isMedia = (tab === 'img' || tab === 'video' || tab === 'audio' || tab === 'm3u8');
        if (searchEl) searchEl.style.display = isMedia ? 'block' : 'none';
        if (filterEl) filterEl.style.display = isMedia ? 'block' : 'none';
        if (footerEl) footerEl.style.display = isMedia ? 'block' : 'none';
        if (progressEl) progressEl.style.display = State.downloading ? 'block' : 'none';

        if (tab === 'img') UI.renderMedia('img');
        else if (tab === 'video') UI.renderMedia('video');
        else if (tab === 'audio') UI.renderMedia('audio');
        else if (tab === 'm3u8') UI.renderM3u8();
        else if (tab === 'translate') UI.renderTranslate();
        else if (tab === 'cookie') UI.renderCookie();
        else if (tab === 'storage') UI.renderStorage();
        else if (tab === 'settings') UI.renderSettings();
    };

    // ===== 进度更新 =====
    UI.updateProgress = function (prog) {
        var bar = document.getElementById('_ms_progress_bar');
        var txt = document.getElementById('_ms_progress_text');
        if (!bar || !txt) return;
        var pct = prog.total > 0 ? (prog.done / prog.total * 100) : 0;
        bar.style.width = pct.toFixed(1) + '%';
        txt.textContent = prog.done + ' / ' + prog.total + '（失败 ' + prog.failed + '）· ' + (prog.speed > 0 ? prog.speed.toFixed(1) + ' 项/秒' : '') + ' · 预计剩余 ' + U.formatTime(prog.eta);
    };

    // ===== 媒体渲染（使用虚拟列表）=====
    UI.renderMedia = function (kind) {
        var box = document.getElementById('_ms_box');
        if (!box) return;
        var c = UI.colors();
        var all = State.listFor(kind);

        // 按大小筛选（使用 metaCache）
        var minKb = State.config.showMinSizeKB || 0;
        var maxKb = State.config.showMaxSizeKB || 0;
        var list = [];
        for (var i = 0; i < all.length; i++) {
            var u = all[i];
            if (minKb > 0 || maxKb > 0) {
                var meta = State.metaCache[u];
                if (meta && meta.size) {
                    var kb = meta.size / 1024;
                    if (minKb > 0 && kb < minKb) continue;
                    if (maxKb > 0 && kb > maxKb) continue;
                }
            }
            list.push(u);
        }

        // 关键词筛选
        var kw = State.searchKeyword;
        var kwList = kw ? list.filter(function (u) { return u.toLowerCase().indexOf(kw) !== -1; }) : list;

        // 视频链接卡片列表
        var vLinkList = [];
        if (kind === 'video') {
            vLinkList = kw ? State.videoLinks.filter(function(v) {
                return v.title.toLowerCase().indexOf(kw) !== -1 || v.url.toLowerCase().indexOf(kw) !== -1;
            }) : State.videoLinks.slice();
        }

        var icon = kind === 'img' ? '🖼' : kind === 'video' ? '🎬' : kind === 'audio' ? '🎵' : '📺';
        var label = kind === 'img' ? LANG.t('tabImg').replace(/^[🖼🎬🎵📺]/, '') : kind === 'video' ? LANG.t('tabVideo').replace(/^[🖼🎬🎵📺]/, '') : kind === 'audio' ? LANG.t('tabAudio').replace(/^[🖼🎬🎵📺]/, '') : LANG.t('tabM3u8').replace(/^[🖼🎬🎵📺]/, '');
        var total = all.length;
        var shown = kwList.length;
        var totalLinks = vLinkList.length;
        var isMobile = UI._isMobile();
        var btnPadding = isMobile ? '10px 14px' : '6px 10px';
        var btnFontSize = isMobile ? '13px' : '11px';
        var titleFontSize = isMobile ? '15px' : '13px';
        var topPadding = isMobile ? '12px 16px' : '10px 14px';

        // 顶部信息栏 + 筛选 + 批量按钮
        var topHtml = '';
        topHtml += '<div style="padding:' + topPadding + ';font-size:' + titleFontSize + ';color:' + c.sub + ';border-bottom:1px solid ' + c.border + ';background:' + c.bg2 + ';">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">' +
                '<div><span style="font-size:' + (isMobile ? '18px' : '16px') + ';margin-right:4px;">' + icon + '</span><b style="color:' + c.txt + ';">' + label + '</b>：' + LANG.t('showing', {shown: shown, total: total}) + (totalLinks > 0 ? ' + 🔗 ' + totalLinks + ' 个页面链接' : '') + '</div>' +
                '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                    '<button id="_ms_sel_all" style="padding:' + btnPadding + ';border:none;border-radius:8px;background:' + c.bg3 + ';color:' + c.txt + ';font-size:' + btnFontSize + ';cursor:pointer;">' + LANG.t('btnSelAll') + '</button>' +
                    '<button id="_ms_sel_none" style="padding:' + btnPadding + ';border:none;border-radius:8px;background:' + c.bg3 + ';color:' + c.txt + ';font-size:' + btnFontSize + ';cursor:pointer;">' + LANG.t('btnSelNone') + '</button>' +
                    '<button id="_ms_dl_sel" style="padding:' + btnPadding + ';border:none;border-radius:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:' + btnFontSize + ';font-weight:600;cursor:pointer;">📥 ' + LANG.t('downloadSel') + '</button>' +
                    '<button id="_ms_dl_all" style="padding:' + btnPadding + ';border:none;border-radius:8px;background:linear-gradient(135deg,#10b981,#34d399);color:#fff;font-size:' + btnFontSize + ';font-weight:600;cursor:pointer;">📥 ' + LANG.t('downloadAll') + '</button>' +
                    '<button id="_ms_copy_sel" style="padding:' + btnPadding + ';border:none;border-radius:8px;background:' + c.bg3 + ';color:' + c.txt + ';font-size:' + btnFontSize + ';cursor:pointer;">📋 ' + LANG.t('copySelUrl') + '</button>' +
                    '<button id="_ms_copy_all" style="padding:' + btnPadding + ';border:none;border-radius:8px;background:' + c.bg3 + ';color:' + c.txt + ';font-size:' + btnFontSize + ';cursor:pointer;">📋 ' + LANG.t('copyAllUrl') + '</button>' +
                    '<button id="_ms_show_filter" style="padding:' + btnPadding + ';border:none;border-radius:8px;background:' + c.bg3 + ';color:' + c.txt + ';font-size:' + btnFontSize + ';cursor:pointer;">🔧 ' + LANG.t('filter') + '</button>' +
                '</div>' +
            '</div>' +
            '<div id="_ms_filter_panel" style="display:none;margin-top:10px;padding:10px;border-radius:8px;background:' + c.bg + ';border:1px solid ' + c.border + ';">' +
                '<div style="font-size:' + (isMobile ? '14px' : '12px') + ';color:' + c.txt + ';font-weight:600;margin-bottom:8px;">' + LANG.t('filterPanel') + '</div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
                    '<label style="font-size:' + (isMobile ? '13px' : '11px') + ';color:' + c.sub + ';">' + LANG.t('minKb') + '</label>' +
                    '<input id="_ms_min_kb" type="number" value="' + minKb + '" min="0" style="width:' + (isMobile ? '100px' : '80px') + ';padding:' + (isMobile ? '8px' : '4px') + ';border:1px solid ' + c.border + ';border-radius:6px;background:' + c.bg + ';color:' + c.txt + ';font-size:' + (isMobile ? '14px' : '12px') + ';">' +
                    '<label style="font-size:' + (isMobile ? '13px' : '11px') + ';color:' + c.sub + ';">' + LANG.t('maxKb') + '</label>' +
                    '<input id="_ms_max_kb" type="number" value="' + maxKb + '" min="0" style="width:' + (isMobile ? '100px' : '80px') + ';padding:' + (isMobile ? '8px' : '4px') + ';border:1px solid ' + c.border + ';border-radius:6px;background:' + c.bg + ';color:' + c.txt + ';font-size:' + (isMobile ? '14px' : '12px') + ';">' +
                    '<button id="_ms_apply_filter" style="padding:' + (isMobile ? '10px 16px' : '6px 12px') + ';border:none;border-radius:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:' + (isMobile ? '14px' : '12px') + ';cursor:pointer;">' + LANG.t('apply') + '</button>' +
                    '<button id="_ms_reset_filter" style="padding:' + (isMobile ? '10px 16px' : '6px 12px') + ';border:none;border-radius:8px;background:' + c.bg3 + ';color:' + c.txt + ';font-size:' + (isMobile ? '14px' : '12px') + ';cursor:pointer;">' + LANG.t('reset') + '</button>' +
                '</div>' +
            '</div>' +
        '</div>';
        box.innerHTML = topHtml;

        // 视频链接区域
        if (kind === 'video' && vLinkList.length > 0) {
            var vlinkSection = document.createElement('div');
            vlinkSection.style.cssText = 'border-bottom:1px solid ' + c.border + ';background:' + c.bg2 + ';';
            var headerHtml = '<div style="padding:8px 14px;font-size:' + (isMobile ? '14px' : '12px') + ';color:' + c.sub + ';font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">' +
                '<span>🔗 视频页面链接（点击解析获取下载地址）</span>' +
                '<button id="_ms_batch_resolve" style="padding:' + (isMobile ? '10px 16px' : '6px 12px') + ';border:none;border-radius:8px;background:linear-gradient(135deg,#8b5cf6,#a855f7);color:#fff;font-size:' + (isMobile ? '14px' : '11px') + ';font-weight:600;cursor:pointer;flex-shrink:0;">🔄 一键解析全部</button>' +
                '</div>' +
                '<div id="_ms_batch_progress" style="display:none;padding:0 14px 10px;">' +
                    '<div style="display:flex;align-items:center;justify-content:space-between;font-size:' + (isMobile ? '13px' : '11px') + ';color:' + c.txt + ';margin-bottom:6px;">' +
                        '<span id="_ms_batch_progress_text">已解析 0/0，成功 0，失败 0</span>' +
                        '<span id="_ms_batch_progress_pct">0%</span>' +
                    '</div>' +
                    '<div style="width:100%;height:' + (isMobile ? '10px' : '6px') + ';background:' + c.bg3 + ';border-radius:3px;overflow:hidden;">' +
                        '<div id="_ms_batch_progress_bar" style="width:0%;height:100%;background:linear-gradient(90deg,#8b5cf6,#a855f7);transition:width 0.3s ease;border-radius:3px;"></div>' +
                    '</div>' +
                '</div>';
            vlinkSection.innerHTML = headerHtml;
            var vlinkGrid = document.createElement('div');
            var cardMinWidth = isMobile ? '100%' : 'minmax(160px,1fr)';
            var gridCols = isMobile ? 'grid-template-columns:1fr;' : 'grid-template-columns:repeat(auto-fill,minmax(160px,1fr));';
            var coverHeight = isMobile ? '200px' : '90px';
            var titleFontSize = isMobile ? '15px' : '12px';
            var titleHeight = isMobile ? '44px' : '32px';
            var metaFontSize = isMobile ? '13px' : '10px';
            var cardPadding = isMobile ? '10px 12px' : '6px 8px';
            var gridPadding = isMobile ? 'padding:0 12px 12px;' : 'padding:0 10px 10px;';
            var gridGap = isMobile ? 'gap:12px;' : 'gap:8px;';
            vlinkGrid.style.cssText = 'display:grid;' + gridCols + gridGap + gridPadding;
            var longPressTimer = null;
            var longPressTriggered = false;
            function showVlinkContextMenu(vData, card, x, y) {
                var c = UI.colors();
                var menu = document.createElement('div');
                menu.className = '_ms_vlink_ctx_menu';
                var menuW = Math.min(220, window.innerWidth - 20);
                var mx = Math.min(Math.max(10, x - menuW / 2), window.innerWidth - menuW - 10);
                var my = Math.min(Math.max(10, y), window.innerHeight - 260);
                menu.style.cssText = 'position:fixed;left:' + mx + 'px;top:' + my + 'px;z-index:2147483648;background:' + c.bg + ';border:1px solid ' + c.border + ';border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.35);padding:6px;min-width:' + menuW + 'px;';
                var items = [
                    { icon: '▶️', label: '预览视频', action: function() { VideoLinkPreview.preview(vData.url); } },
                    { icon: '📋', label: '复制链接', action: function() { copyText(vData.url); } },
                    { icon: '📥', label: '下载视频', action: function() { VideoLinkPreview.preview(vData.url); } },
                    { icon: '🔗', label: '打开原网页', action: function() { window.open(vData.url, '_blank'); } },
                ];
                for (var mi = 0; mi < items.length; mi++) {
                    (function(item) {
                        var btn = document.createElement('div');
                        btn.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:8px;cursor:pointer;font-size:14px;color:' + c.txt + ';';
                        btn.innerHTML = '<span style="font-size:18px;">' + item.icon + '</span><span>' + item.label + '</span>';
                        btn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            menu.remove();
                            try { item.action(); } catch (e2) {}
                        });
                        btn.addEventListener('touchstart', function() { this.style.background = c.bg3; }, { passive: true });
                        btn.addEventListener('touchend', function() { this.style.background = 'transparent'; }, { passive: true });
                        menu.appendChild(btn);
                    })(items[mi]);
                }
                var closeMenu = function(e) {
                    if (e.target !== menu && !menu.contains(e.target)) {
                        menu.remove();
                        document.removeEventListener('click', closeMenu, true);
                        document.removeEventListener('touchstart', closeMenu, true);
                    }
                };
                setTimeout(function() {
                    document.addEventListener('click', closeMenu, true);
                    document.addEventListener('touchstart', closeMenu, true);
                }, 50);
                document.body.appendChild(menu);
            }
            for (var vi = 0; vi < vLinkList.length; vi++) {
                var vItem = vLinkList[vi];
                var vCard = document.createElement('div');
                vCard.setAttribute('data-vlink', vItem.url);
                vCard.style.cssText = 'background:' + c.bg + ';border:1px solid ' + c.border + ';border-radius:10px;overflow:hidden;cursor:pointer;transition:transform 0.15s, box-shadow 0.15s;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
                vCard.onmouseenter = function() { this.style.transform = 'translateY(-2px)'; this.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; };
                vCard.onmouseleave = function() { this.style.transform = 'translateY(0)'; this.style.boxShadow = 'none'; };
                vCard.addEventListener('touchstart', function() { this.style.transform = 'scale(0.96)'; }, { passive: true });
                vCard.addEventListener('touchend', function() { var self = this; setTimeout(function() { self.style.transform = 'scale(1)'; }, 100); }, { passive: true });
                vCard.addEventListener('touchcancel', function() { this.style.transform = 'scale(1)'; }, { passive: true });
                var vCoverHtml;
                if (vItem.cover) {
                    vCoverHtml = '<img src="' + vItem.cover + '" loading="lazy" style="width:100%;height:' + coverHeight + ';object-fit:cover;display:block;" onerror="var d=document.createElement(\'div\');d.style.cssText=\'width:100%;height:' + coverHeight + ';background:linear-gradient(135deg,#1e293b,#334155);display:flex;align-items:center;justify-content:center;color:#fff;font-size:' + (isMobile ? '36px' : '24px') + ';\';d.textContent=\'🎬\';this.parentNode.replaceChild(d,this);">';
                } else {
                    var iconSize = isMobile ? '36px' : '24px';
                    vCoverHtml = '<div style="width:100%;height:' + coverHeight + ';background:linear-gradient(135deg,#1e293b,#334155);display:flex;align-items:center;justify-content:center;color:#fff;font-size:' + iconSize + ';">🎬</div>';
                }
                var isResolved = UI._vlinkResolved[vItem.url];
                var resolveBtnText = isResolved ? '✅ 已解析' : '解析 ⬇';
                var resolveBtnColor = isResolved ? '#10b981' : '#8b5cf6';
                vCard.innerHTML = vCoverHtml +
                    '<div style="padding:' + cardPadding + ';">' +
                        '<div style="font-size:' + titleFontSize + ';color:' + c.txt + ';line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;height:' + titleHeight + ';">' + vItem.title + '</div>' +
                        '<div style="font-size:' + metaFontSize + ';color:' + c.sub + ';margin-top:6px;display:flex;align-items:center;justify-content:space-between;">' +
                            '<span>' + vItem.siteIcon + ' ' + vItem.siteName + '</span>' +
                            '<span class="_ms_resolve_btn" style="color:' + resolveBtnColor + ';font-weight:600;">' + resolveBtnText + '</span>' +
                        '</div>' +
                    '</div>';
                (function(vData, card) {
                    var lpTimer = null;
                    var lpTriggered = false;
                    var lpStartX = 0, lpStartY = 0;
                    function lpStart(e) {
                        lpTriggered = false;
                        var t = e.touches ? e.touches[0] : e;
                        lpStartX = t.clientX;
                        lpStartY = t.clientY;
                        lpTimer = setTimeout(function() {
                            lpTriggered = true;
                            if (navigator.vibrate) { try { navigator.vibrate(50); } catch (e2) {} }
                            showVlinkContextMenu(vData, card, lpStartX, lpStartY);
                        }, 500);
                    }
                    function lpMove(e) {
                        if (!lpTimer) return;
                        var t = e.touches ? e.touches[0] : e;
                        if (Math.abs(t.clientX - lpStartX) > 10 || Math.abs(t.clientY - lpStartY) > 10) {
                            clearTimeout(lpTimer);
                            lpTimer = null;
                        }
                    }
                    function lpEnd() {
                        if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
                    }
                    card.addEventListener('touchstart', lpStart, { passive: true });
                    card.addEventListener('touchmove', lpMove, { passive: true });
                    card.addEventListener('touchend', lpEnd);
                    card.addEventListener('touchcancel', lpEnd);
                    card.addEventListener('click', function() {
                        if (lpTriggered) { lpTriggered = false; return; }
                        VideoLinkPreview.preview(vData.url);
                    });
                })(vItem, vCard);
                vlinkGrid.appendChild(vCard);
            }
            vlinkSection.appendChild(vlinkGrid);
            box.appendChild(vlinkSection);

            setTimeout(function() {
                UI._observeVlinkCards(vlinkSection);
            }, 50);

            var batchBtn = document.getElementById('_ms_batch_resolve');
            if (batchBtn) {
                batchBtn.addEventListener('click', function() {
                    var progressDiv = document.getElementById('_ms_batch_progress');
                    var progressBar = document.getElementById('_ms_batch_progress_bar');
                    var progressText = document.getElementById('_ms_batch_progress_text');
                    var progressPct = document.getElementById('_ms_batch_progress_pct');
                    if (progressDiv) progressDiv.style.display = 'block';
                    batchBtn.disabled = true;
                    batchBtn.style.opacity = '0.6';
                    batchBtn.style.cursor = 'not-allowed';
                    batchBtn.textContent = '⏳ 解析中...';
                    UI.batchResolveVlinks(vLinkList, function(completed, total, successCount, failedCount) {
                        var pct = total > 0 ? (completed / total * 100) : 0;
                        if (progressBar) progressBar.style.width = pct.toFixed(1) + '%';
                        if (progressText) progressText.textContent = '已解析 ' + completed + '/' + total + '，成功 ' + successCount + '，失败 ' + failedCount;
                        if (progressPct) progressPct.textContent = pct.toFixed(0) + '%';
                    }, function(total, successCount, failedCount) {
                        batchBtn.disabled = false;
                        batchBtn.style.opacity = '1';
                        batchBtn.style.cursor = 'pointer';
                        batchBtn.textContent = '🔄 一键解析全部';
                        toast('批量解析完成：成功 ' + successCount + '，失败 ' + failedCount, '#10b981');
                    });
                });
            }
        }

        if (total === 0 && vLinkList.length === 0) {
            box.innerHTML += '<div style="padding:60px 20px;text-align:center;color:' + c.sub + ';font-size:14px;">' + LANG.t('noMedia') + '</div>';
            UI.renderFooter(kind, []);
            bindFilterButtons(kind);
            bindActionButtons(kind, []);
            return;
        }
        if (shown === 0 && (minKb > 0 || maxKb > 0 || kw)) {
            box.innerHTML += '<div style="padding:40px 20px;text-align:center;color:' + c.warn + ';font-size:13px;">' + LANG.t('filterNoMatch') + '</div>';
            UI.renderFooter(kind, []);
            bindFilterButtons(kind);
            bindActionButtons(kind, []);
            return;
        }

        // 使用虚拟列表（超过 100 条时）
        var useVirtual = kwList.length > 100;
        var container = document.createElement('div');
        container.style.cssText = 'flex:1;overflow-y:auto;position:relative;';
        box.appendChild(container);

        if (useVirtual) {
            UI.VirtualList(container, kwList, function (url, idx) {
                return UI._renderMediaCard(url, idx, kind);
            }, 130, 10);
            // 绑定事件（通过事件委托）
            container.addEventListener('click', function (e) {
                var t = e.target.closest && e.target.closest('[data-url]');
                if (!t) return;
                var u = t.getAttribute('data-url');
                if (e.shiftKey) {
                    if (State.selected.has(u)) State.selected.delete(u);
                    else State.selected.add(u);
                    UI.renderMedia(kind);
                } else {
                    UI.previewMedia(u, kind);
                }
            });
        } else {
            var grid = document.createElement('div');
            var gridCols = isMobile ? 'grid-template-columns:repeat(2,1fr);' : 'grid-template-columns:repeat(auto-fill,minmax(120px,1fr));';
            var gridGap = isMobile ? 'gap:10px;' : 'gap:8px;';
            var gridPad = isMobile ? 'padding:12px;' : 'padding:10px;';
            grid.style.cssText = 'display:grid;' + gridCols + gridGap + gridPad;
            for (var i = 0; i < kwList.length; i++) {
                var cardEl = document.createElement('div');
                cardEl.innerHTML = UI._renderMediaCard(kwList[i], i, kind);
                var firstChild = cardEl.firstElementChild;
                if (firstChild) {
                    (function (url, el, k) {
                        el.addEventListener('click', function (e) {
                            if (e.shiftKey) {
                                if (State.selected.has(url)) State.selected.delete(url);
                                else State.selected.add(url);
                                UI.renderMedia(k);
                            } else {
                                UI.previewMedia(url, k);
                            }
                        });
                        el.addEventListener('dblclick', function () {
                            try {
                                Dl.one(url, Dl.buildName(url, 1, '', State.config.nameTpl), State.config.batchRetry, State.config.customHeaders);
                            } catch (e) {}
                        });
                    })(kwList[i], firstChild, kind);
                }
                grid.appendChild(cardEl.firstElementChild || cardEl);
            }
            container.appendChild(grid);
        }

        UI.renderFooter(kind, kwList);
        bindFilterButtons(kind);
        bindActionButtons(kind, kwList);

        if (kind === 'video' && State.config.autoExtractThumb) {
            setTimeout(function () { UI._loadVisibleVideoThumbs(container); }, 100);
            container.addEventListener('scroll', function () {
                clearTimeout(UI._thumbScrollTimer);
                UI._thumbScrollTimer = setTimeout(function () { UI._loadVisibleVideoThumbs(container); }, 200);
            });
        }

        if (kind === 'video' && vLinkList.length > 0) {
            container.addEventListener('scroll', function () {
                UI._onVlinkScrollStart();
                clearTimeout(UI._vlinkScrollTimer);
                UI._vlinkScrollTimer = setTimeout(function () {
                    UI._onVlinkScrollEnd();
                }, 150);
            });
        }
    };

    // 辅助函数：绑定筛选按钮
    function bindFilterButtons(kind) {
        try {
            var showBtn = document.getElementById('_ms_show_filter');
            if (showBtn) showBtn.onclick = function () {
                var p = document.getElementById('_ms_filter_panel');
                if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
            };
            var applyBtn = document.getElementById('_ms_apply_filter');
            if (applyBtn) applyBtn.onclick = function () {
                var minEl = document.getElementById('_ms_min_kb');
                var maxEl = document.getElementById('_ms_max_kb');
                var minV = minEl ? parseInt(minEl.value, 10) || 0 : 0;
                var maxV = maxEl ? parseInt(maxEl.value, 10) || 0 : 0;
                State.config.showMinSizeKB = minV;
                State.config.showMaxSizeKB = maxV;
                State.save();
                toast(LANG.t('filterAppliedToast'));
                UI.renderMedia(kind);
            };
            var resetBtn = document.getElementById('_ms_reset_filter');
            if (resetBtn) resetBtn.onclick = function () {
                State.config.showMinSizeKB = 0;
                State.config.showMaxSizeKB = 0;
                State.save();
                UI.renderMedia(kind);
            };
        } catch (e) {}
    }

    // 辅助函数：绑定批量操作按钮
    function bindActionButtons(kind, list) {
        try {
            var selAll = document.getElementById('_ms_sel_all');
            if (selAll) selAll.onclick = function () {
                for (var i = 0; i < list.length; i++) State.selected.add(list[i]);
                UI.renderMedia(kind);
            };
            var selNone = document.getElementById('_ms_sel_none');
            if (selNone) selNone.onclick = function () {
                State.selected.clear();
                UI.renderMedia(kind);
            };
            var dlSel = document.getElementById('_ms_dl_sel');
            if (dlSel) dlSel.onclick = function () {
                var selArr = [];
                for (var i = 0; i < list.length; i++) if (State.selected.has(list[i])) selArr.push(list[i]);
                if (selArr.length === 0) { toast(LANG.t('noSelFile'), '#ef4444'); return; }
                if (!confirm(LANG.t('confirmDlSel', {n: selArr.length}))) return;
                toast(LANG.t('startDlToast', {n: selArr.length}));
                Dl.batch(selArr, kind, null, null);
            };
            var dlAll = document.getElementById('_ms_dl_all');
            if (dlAll) dlAll.onclick = function () {
                if (!list || list.length === 0) { toast(LANG.t('noDlFile'), '#ef4444'); return; }
                if (!confirm(LANG.t('confirmDlAll', {n: list.length}))) return;
                toast(LANG.t('startDlToast', {n: list.length}));
                Dl.batch(list, kind, null, null);
            };
            var cpSel = document.getElementById('_ms_copy_sel');
            if (cpSel) cpSel.onclick = function () {
                var text = '';
                for (var i = 0; i < list.length; i++) if (State.selected.has(list[i])) text += list[i] + '\n';
                if (!text) { toast(LANG.t('noSelFile'), '#ef4444'); return; }
                copyText(text.trim());
            };
            var cpAll = document.getElementById('_ms_copy_all');
            if (cpAll) cpAll.onclick = function () {
                if (!list || list.length === 0) { toast(LANG.t('noCopyUrl'), '#ef4444'); return; }
                copyText(list.join('\n'));
            };
        } catch (e) {}
    }

    UI._renderMediaCard = function (url, idx, kind) {
        var c = UI.colors();
        var isMobile = UI._isMobile();
        var isSel = State.selected.has(url);
        var borderStyle = isSel ? '2px solid #6366f1' : '1px solid ' + c.border;
        var shadow = isSel ? 'box-shadow:0 4px 12px rgba(99,102,241,.35);' : '';
        var nameFontSize = isMobile ? '13px' : '11px';
        var namePadding = isMobile ? '8px 10px' : '6px 8px';
        var nameMaxHeight = isMobile ? '56px' : '48px';
        var markSize = isMobile ? '28px' : '24px';
        var markFontSize = isMobile ? '16px' : '14px';
        var iconSize = isMobile ? '32px' : '28px';
        var thumbHtml = '';
        if (kind === 'img') {
            thumbHtml = '<img src="' + url + '" loading="lazy" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;" onerror="this.style.display=\'none\';this.parentNode.style.background=\'#334155\';">';
        } else if (kind === 'video') {
            var cached = UI._thumbCache[url];
            if (cached) {
                thumbHtml = '<img src="' + cached + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;" onerror="var d=document.createElement(\'div\');d.style.cssText=\'width:100%;height:100%;background:linear-gradient(135deg,#1e293b,#334155);display:flex;align-items:center;justify-content:center;color:#fff;font-size:' + iconSize + ';\';d.textContent=\'▶\';this.parentNode.appendChild(d);this.remove();">';
            } else {
                thumbHtml = '<div class="_ms_v_thumb" data-url="' + url + '" style="width:100%;height:100%;background:linear-gradient(135deg,#1e293b,#334155);display:flex;align-items:center;justify-content:center;color:#fff;font-size:' + iconSize + ';">▶</div>';
            }
        } else if (kind === 'audio') {
            thumbHtml = '<div style="width:100%;height:100%;background:linear-gradient(135deg,#ec4899,#f97316);display:flex;align-items:center;justify-content:center;color:#fff;font-size:' + iconSize + ';">🎵</div>';
        } else {
            thumbHtml = '<div style="width:100%;height:100%;background:linear-gradient(135deg,#0ea5e9,#6366f1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:' + (isMobile ? '24px' : '20px') + ';font-weight:700;">m3u8</div>';
        }
        var markHtml = isSel ? '<div style="position:absolute;top:' + (isMobile ? '8px' : '6px') + ';right:' + (isMobile ? '8px' : '6px') + ';width:' + markSize + ';height:' + markSize + ';border-radius:50%;background:#6366f1;color:#fff;font-size:' + markFontSize + ';font-weight:700;display:flex;align-items:center;justify-content:center;z-index:2;">✓</div>' : '';
        return '<div data-url="' + url + '" data-idx="' + idx + '" style="position:relative;border-radius:10px;background:' + c.bg2 + ';overflow:hidden;cursor:pointer;' + borderStyle + shadow + ';">' +
            '<div style="width:100%;aspect-ratio:1/1;overflow:hidden;background:' + c.bg3 + ';display:flex;align-items:center;justify-content:center;">' + thumbHtml + '</div>' +
            '<div style="padding:' + namePadding + ';font-size:' + nameFontSize + ';color:' + c.txt + ';line-height:1.3;word-break:break-all;overflow:hidden;max-height:' + nameMaxHeight + ';text-overflow:ellipsis;">' + U.trunc(SEC.nameFromUrl(url), isMobile ? 40 : 30) + '</div>' +
            markHtml +
            '</div>';
    };

    // ===== m3u8 Tab（特殊渲染）=====
    UI.renderM3u8 = function () {
        var box = document.getElementById('_ms_box');
        if (!box) return;
        var c = UI.colors();
        var list = State.m3u8;
        var kw = State.searchKeyword;
        if (kw) list = list.filter(function (u) { return u.toLowerCase().indexOf(kw) !== -1; });

        box.innerHTML = '<div style="padding:10px 14px;font-size:13px;color:' + c.sub + ';border-bottom:1px solid ' + c.border + ';background:' + c.bg2 + ';">' + LANG.t('m3u8Title', {n: list.length}) + '</div>';

        if (list.length === 0) {
            box.innerHTML += '<div style="padding:60px 20px;text-align:center;color:' + c.sub + ';font-size:14px;">' + LANG.t('noM3u8') + '</div>';
            UI.renderFooter('m3u8', []);
            return;
        }

        // m3u8 列表（显示详细信息）
        var container = document.createElement('div');
        container.style.cssText = 'padding:10px;';
        for (var i = 0; i < list.length; i++) {
            var url = list[i];
            var item = document.createElement('div');
            item.style.cssText = 'padding:12px;border-radius:10px;background:' + c.bg2 + ';border:1px solid ' + c.border + ';margin-bottom:8px;';
            item.innerHTML = '<div style="font-size:13px;font-weight:600;color:' + c.txt + ';margin-bottom:6px;word-break:break-all;">' + U.trunc(url, 60) + '</div>' +
                '<div style="font-size:11px;color:' + c.sub + ';margin-bottom:8px;">' + SEC.nameFromUrl(url) + '</div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                '<button data-op="download" data-url="' + url + '" style="padding:8px 12px;border:none;border-radius:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:12px;font-weight:600;cursor:pointer;flex:1;">' + LANG.t('dlMerge') + '</button>' +
                '<button data-op="script" data-url="' + url + '" style="padding:8px 12px;border:none;border-radius:8px;background:' + c.bg3 + ';color:' + c.txt + ';font-size:12px;font-weight:600;cursor:pointer;flex:1;">' + LANG.t('genScriptBtn') + '</button>' +
                '<button data-op="preview" data-url="' + url + '" style="padding:8px 12px;border:none;border-radius:8px;background:' + c.bg3 + ';color:' + c.txt + ';font-size:12px;font-weight:600;cursor:pointer;">' + LANG.t('detailBtn') + '</button>' +
                '</div>';
            // 绑定按钮事件
            var btns = item.querySelectorAll('button');
            for (var j = 0; j < btns.length; j++) {
                btns[j].addEventListener('click', function (e) {
                    var op = this.getAttribute('data-op');
                    var u = this.getAttribute('data-url');
                    if (op === 'download') {
                        toast(LANG.t('m3u8Start'));
                        M3U8.downloadAndMerge(u, { quality: State.config.m3u8Quality, concurrency: State.config.m3u8Concurrency },
                            function (done, total, failed) { toast(LANG.t('m3u8Progress', {d: done, t: total}), '#6366f1'); },
                            function (data, err) {
                                if (err) toast(LANG.t('m3u8Fail') + ': ' + err, '#ef4444');
                                else {
                                    var blob = new Blob([data], { type: 'video/mp2t' });
                                    var blobUrl = URL.createObjectURL(blob);
                                    var name = SEC.safeFilename(SEC.nameFromUrl(u)) + '.mp4';
                                    Dl.fallback(blobUrl, name, null);
                                    toast(LANG.t('m3u8Done'));
                                }
                            }
                        );
                    } else if (op === 'script') {
                        var script = M3U8.generateDownloadScript(u, 'aria2');
                        copyText(script);
                        toast(LANG.t('scriptCopied'));
                    } else if (op === 'preview') {
                        UI.previewM3u8(u);
                    }
                });
            }
            container.appendChild(item);
        }
        box.appendChild(container);
        UI.renderFooter('m3u8', list);
    };

    // ===== m3u8 详情弹窗 =====
    UI.previewM3u8 = function (url) {
        try {
            var c = UI.colors();
            var overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:2147483650;padding:20px;';
            var modal = document.createElement('div');
            modal.style.cssText = 'max-width:600px;width:100%;background:' + c.bg + ';color:' + c.txt + ';border-radius:16px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.5);';

            modal.innerHTML = '<div style="font-size:16px;font-weight:700;margin-bottom:12px;">' + LANG.t('m3u8Detail') + '</div>' +
                '<div style="background:' + c.bg2 + ';padding:12px;border-radius:10px;font-size:12px;color:' + c.sub + ';word-break:break-all;margin-bottom:16px;font-family:monospace;">' + url + '</div>' +
                '<div id="_ms_m3u8_info" style="padding:16px;background:' + c.bg2 + ';border-radius:10px;margin-bottom:16px;">' + LANG.t('parsing') + '</div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                '<button id="_ms_m3u8_dl" style="flex:1;min-width:120px;padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:14px;font-weight:600;cursor:pointer;">' + LANG.t('dlMerge') + '</button>' +
                '<button id="_ms_m3u8_script" style="flex:1;min-width:120px;padding:12px;border:none;border-radius:10px;background:' + c.bg3 + ';color:' + c.txt + ';font-size:14px;font-weight:600;cursor:pointer;">' + LANG.t('genScriptBtn') + '</button>' +
                '<button id="_ms_m3u8_close" style="padding:12px 20px;border:none;border-radius:10px;background:#475569;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">' + LANG.t('close') + '</button>' +
                '</div>';

            overlay.appendChild(modal);
            overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
            (document.documentElement || document.body).appendChild(overlay);

            // 解析 m3u8
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.timeout = 15000;
            xhr.onload = function () {
                if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
                    var parsed = M3U8.parse(xhr.responseText, url);
                    var info = document.getElementById('_ms_m3u8_info');
                    if (info) {
                        var html = '<div style="font-size:13px;color:' + c.txt + ';margin-bottom:8px;">' + LANG.t('parseResult') + '</div>';
                        if (parsed.isMaster) {
                            html += '<div style="font-size:12px;color:' + c.sub + ';">' + LANG.t('masterStreams', {n: parsed.streams.length}) + '</div>';
                            for (var i = 0; i < parsed.streams.length; i++) {
                                html += '<div style="padding:8px 10px;margin:4px 0;background:' + c.bg + ';border-radius:6px;font-size:12px;color:' + c.txt + ';">' +
                                    '<b>' + parsed.streams[i].label + '</b> · ' + parsed.streams[i].resolution + ' · ' + U.formatSize(parsed.streams[i].bandwidth) + '/s' +
                                    '</div>';
                            }
                        } else {
                            html += '<div style="font-size:12px;color:' + c.sub + ';">' + LANG.t('segmentsInfo', {n: parsed.segments.length, t: U.formatTime(parsed.duration)}) + '</div>';
                            html += '<div style="font-size:12px;color:' + (parsed.encrypted ? '#ef4444' : '#10b981') + ';margin-top:6px;">' + (parsed.encrypted ? LANG.t('encrypted') : LANG.t('notEncrypted')) + (parsed.encrypted ? ' (' + parsed.keyMethod + ')' : '') + '</div>';
                        }
                        info.innerHTML = html;
                    }
                }
            };
            xhr.onerror = function () { var info = document.getElementById('_ms_m3u8_info'); if (info) info.innerHTML = '<div style="color:#ef4444;">' + LANG.t('parseFailNet') + '</div>'; };
            xhr.ontimeout = function () { var info = document.getElementById('_ms_m3u8_info'); if (info) info.innerHTML = '<div style="color:#ef4444;">' + LANG.t('parseFailTimeout') + '</div>'; };
            xhr.send();

            // 绑定按钮
            document.getElementById('_ms_m3u8_dl').addEventListener('click', function () {
                toast(LANG.t('startDl'));
                M3U8.downloadAndMerge(url, { quality: State.config.m3u8Quality }, null, function (data, err) {
                    if (err) toast(LANG.t('transFail') + ': ' + err, '#ef4444');
                    else {
                        var blob = new Blob([data], { type: 'video/mp2t' });
                        Dl.fallback(URL.createObjectURL(blob), SEC.safeFilename(SEC.nameFromUrl(url)) + '.mp4', null);
                        toast(LANG.t('done'));
                        overlay.remove();
                    }
                });
            });
            document.getElementById('_ms_m3u8_script').addEventListener('click', function () {
                copyText(M3U8.generateDownloadScript(url, 'aria2'));
                toast(LANG.t('scriptCopied'));
            });
            document.getElementById('_ms_m3u8_close').addEventListener('click', function () { overlay.remove(); });
        } catch (e) { toast(LANG.t('previewFail') + ': ' + e.message, '#ef4444'); }
    };

    // ===== 媒体预览弹窗（P1-1）=====
    UI.previewMedia = function (url, kind) {
        try {
            var c = UI.colors();
            var overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:2147483650;padding:20px;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);';
            var modal = document.createElement('div');
            modal.style.cssText = 'max-width:min(92vw,900px);max-height:92vh;background:' + c.bg + ';color:' + c.txt + ';border-radius:18px;padding:18px;box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:auto;animation:msfade .2s ease-out;';

            // 头部
            var header = document.createElement('div');
            header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:10px;';
            var title = document.createElement('div');
            title.style.cssText = 'flex:1;font-size:14px;font-weight:700;word-break:break-all;line-height:1.4;';
            title.textContent = U.trunc(SEC.nameFromUrl(url) || url, 60);
            var closeBtn = document.createElement('button');
            closeBtn.textContent = '✕';
            closeBtn.style.cssText = 'border:none;background:' + c.bg3 + ';color:' + c.txt + ';font-size:16px;width:34px;height:34px;border-radius:50%;cursor:pointer;flex-shrink:0;';
            closeBtn.onclick = function () { try { overlay.remove(); } catch(e) {} };
            header.appendChild(title);
            header.appendChild(closeBtn);
            modal.appendChild(header);

            // 媒体预览区域
            var mediaBox = document.createElement('div');
            mediaBox.style.cssText = 'margin-bottom:12px;border-radius:12px;overflow:hidden;background:' + c.bg2 + ';';

            if (kind === 'img') {
                var img = document.createElement('img');
                img.src = url; img.style.cssText = 'max-width:100%;max-height:65vh;display:block;margin:0 auto;border-radius:8px;';
                mediaBox.appendChild(img);
            } else if (kind === 'video') {
                var v = document.createElement('video');
                v.src = url; v.controls = true; v.autoplay = false;
                v.style.cssText = 'max-width:100%;max-height:65vh;display:block;margin:0 auto;border-radius:8px;background:#000;min-height:180px;';
                v.setAttribute('playsinline', '');
                var cachedPoster = UI._thumbCache[url];
                if (cachedPoster) {
                    v.poster = cachedPoster;
                } else {
                    v.addEventListener('loadeddata', function() {
                        try {
                            v.currentTime = Math.min(1, (v.duration || 2) / 4);
                            v.pause();
                        } catch(e) {}
                    });
                    // 主动提取封面
                    UI._extractVideoThumb(url, function(dataUrl) {
                        try { v.poster = dataUrl; } catch(e) {}
                    });
                }
                mediaBox.appendChild(v);
            } else if (kind === 'audio') {
                var a = document.createElement('audio');
                a.src = url; a.controls = true; a.style.cssText = 'width:100%;padding:30px 20px;border-radius:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);';
                mediaBox.appendChild(a);
            } else {
                mediaBox.textContent = LANG.t('m3u8PreviewHint');
                mediaBox.style.cssText += 'padding:30px;text-align:center;';
            }
            modal.appendChild(mediaBox);

            // URL 显示
            var urlBox = document.createElement('div');
            urlBox.style.cssText = 'background:' + c.bg2 + ';padding:10px 12px;border-radius:10px;font-size:11px;color:' + c.sub + ';word-break:break-all;margin-bottom:10px;font-family:SF Mono,Consolas,monospace;line-height:1.5;';
            urlBox.textContent = url;
            modal.appendChild(urlBox);

            // 元信息
            var metaBox = document.createElement('div');
            metaBox.style.cssText = 'background:' + c.bg2 + ';padding:10px 12px;border-radius:10px;font-size:12px;color:' + c.sub + ';margin-bottom:12px;line-height:1.7;';
            metaBox.innerHTML = '<span style="color:' + c.txt + ';">' + LANG.t('loadingMeta') + '</span>';
            modal.appendChild(metaBox);

            // 获取元信息
            var metaInfo = [];
            function updateMeta() {
                if (metaInfo.length > 0) metaBox.innerHTML = metaInfo.join(' · ');
            }
            if (kind === 'img') {
                Meta.fetchImageSize(url, function (w, h, err) {
                    if (w) metaInfo.push(LANG.t('size') + ': ' + w + ' × ' + h + 'px');
                    updateMeta();
                });
            } else if (kind === 'video') {
                Meta.fetchVideoDuration(url, function (dur, err) {
                    if (dur) metaInfo.push(LANG.t('duration') + ': ' + U.formatTime(dur));
                    updateMeta();
                });
            } else if (kind === 'audio') {
                Meta.fetchAudioDuration(url, function (dur, err) {
                    if (dur) metaInfo.push(LANG.t('duration') + ': ' + U.formatTime(dur));
                    updateMeta();
                });
            }
            Meta.fetchSize(url, function (size, err) {
                if (size) metaInfo.push(LANG.t('size') + ': ' + U.formatSize(size));
                metaInfo.push('URL: ' + url.substring(0, 40) + (url.length > 40 ? '...' : ''));
                updateMeta();
            });

            // 操作按钮
            var btnWrap = document.createElement('div');
            btnWrap.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;';
            function mkBtn(label, gradient, handler) {
                var b = document.createElement('button');
                b.textContent = label; b.style.cssText = 'padding:12px 14px;border:none;border-radius:10px;background:linear-gradient(135deg,' + gradient + ');color:#fff;font-size:13px;font-weight:600;cursor:pointer;';
                b.addEventListener('click', handler); btnWrap.appendChild(b);
            }
            mkBtn('⬇ ' + LANG.t('download'), '#6366f1,#8b5cf6', function () {
                try { Dl.one(url, Dl.buildName(url, 1, '', State.config.nameTpl), State.config.batchRetry, State.config.customHeaders); toast(LANG.t('startDl')); }
                catch(e) { toast(LANG.t('fail') + ': ' + e.message, '#ef4444'); }
            });
            mkBtn('📋 ' + LANG.t('copyUrl'), '#10b981,#34d399', function () { copyText(url); });
            mkBtn('🌐 ' + LANG.t('openTab'), '#f59e0b,#fbbf24', function () { try { window.open(url, '_blank'); } catch (e) {} });
            if (kind === 'video' || kind === 'm3u8') {
                mkBtn('🎞 ' + LANG.t('extractCover'), '#ec4899,#f472b6', function () {
                    try {
                        var video = document.createElement('video');
                        video.crossOrigin = 'anonymous';
                        video.src = url;
                        video.muted = true;
                        video.addEventListener('loadeddata', function () {
                            try {
                                video.currentTime = Math.min(1, (video.duration || 2) / 4);
                                video.addEventListener('seeked', function () {
                                    var canvas = document.createElement('canvas');
                                    canvas.width = video.videoWidth || 640;
                                    canvas.height = video.videoHeight || 360;
                                    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
                                    canvas.toBlob(function (blob) {
                                        var imgUrl = URL.createObjectURL(blob);
                                        var a = document.createElement('a');
                                        a.href = imgUrl;
                                        a.download = 'thumbnail_' + Date.now() + '.jpg';
                                        a.click();
                                        setTimeout(function(){ URL.revokeObjectURL(imgUrl); }, 1000);
                                        toast(LANG.t('coverExtracted'));
                                    }, 'image/jpeg', 0.9);
                                });
                            } catch (err) {
                                toast(LANG.t('coverFail') + ': ' + err.message, '#ef4444');
                            }
                        });
                        video.addEventListener('error', function () {
                            toast(LANG.t('coverFail'), '#ef4444');
                        });
                        toast(LANG.t('coverWait'));
                    } catch (err) { toast(LANG.t('extractFail') + ': ' + err.message, '#ef4444'); }
                });
            }
            modal.appendChild(btnWrap);

            overlay.appendChild(modal);
            overlay.addEventListener('click', function (e) { if (e.target === overlay) try { overlay.remove(); } catch(e) {} });
            (document.documentElement || document.body).appendChild(overlay);

            // 键盘快捷键
            var prevKeyHandler = function(e) {
                if (e.key === 'Escape') { try { overlay.remove(); document.removeEventListener('keydown', prevKeyHandler); } catch(err) {} }
            };
            document.addEventListener('keydown', prevKeyHandler);
        } catch (e) { toast(LANG.t('previewFail') + ': ' + e.message, '#ef4444'); }
    };

    UI.showFilterDialog = function () {
        try {
            var c = UI.colors();
            var overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:2147483650;padding:20px;';
            var modal = document.createElement('div');
            modal.style.cssText = 'max-width:400px;width:100%;background:' + c.bg + ';color:' + c.txt + ';border-radius:16px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.5);';

            modal.innerHTML = '<div style="font-size:16px;font-weight:700;margin-bottom:16px;">' + LANG.t('advFilterTitle') + '</div>' +
                '<div style="font-size:13px;color:' + c.sub + ';margin-bottom:12px;">' + LANG.t('advFilterDesc') + '</div>' +
                '<div style="margin-bottom:12px;"><label style="font-size:12px;color:' + c.txt + ';display:block;margin-bottom:4px;">' + LANG.t('minImageSize') + '</label><input type="number" id="_ms_filter_img_size" value="' + State.config.minImageSize + '" style="width:100%;padding:8px;border:1px solid ' + c.border + ';border-radius:8px;background:' + c.bg + ';color:' + c.txt + ';font-size:13px;box-sizing:border-box;"></div>' +
                '<div style="margin-bottom:12px;"><label style="font-size:12px;color:' + c.txt + ';display:block;margin-bottom:4px;">' + LANG.t('minImageWidth') + '</label><input type="number" id="_ms_filter_img_w" value="' + State.config.minImageWidth + '" style="width:100%;padding:8px;border:1px solid ' + c.border + ';border-radius:8px;background:' + c.bg + ';color:' + c.txt + ';font-size:13px;box-sizing:border-box;"></div>' +
                '<div style="margin-bottom:12px;"><label style="font-size:12px;color:' + c.txt + ';display:block;margin-bottom:4px;">' + LANG.t('minVideoDuration') + '</label><input type="number" id="_ms_filter_vid_dur" value="' + State.config.minVideoDuration + '" style="width:100%;padding:8px;border:1px solid ' + c.border + ';border-radius:8px;background:' + c.bg + ';color:' + c.txt + ';font-size:13px;box-sizing:border-box;"></div>' +
                '<div style="display:flex;gap:8px;margin-top:16px;">' +
                '<button id="_ms_filter_apply" style="flex:1;padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:14px;font-weight:600;cursor:pointer;">' + LANG.t('applyFilterBtn') + '</button>' +
                '<button id="_ms_filter_close" style="padding:12px 20px;border:none;border-radius:10px;background:#475569;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">' + LANG.t('close') + '</button>' +
                '</div>';

            overlay.appendChild(modal);
            overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
            (document.documentElement || document.body).appendChild(overlay);

            document.getElementById('_ms_filter_apply').addEventListener('click', function () {
                State.config.minImageSize = parseInt(document.getElementById('_ms_filter_img_size').value || '0', 10);
                State.config.minImageWidth = parseInt(document.getElementById('_ms_filter_img_w').value || '0', 10);
                State.config.minVideoDuration = parseInt(document.getElementById('_ms_filter_vid_dur').value || '0', 10);
                State.save();
                toast(LANG.t('saved'));
                overlay.remove();
                // 重新渲染
                UI.renderMedia(State.tab);
            });
            document.getElementById('_ms_filter_close').addEventListener('click', function () { overlay.remove(); });
        } catch (e) {}
    };

    // ===== 底部栏 =====
    UI.renderFooter = function (kind, list) {
        var ft = document.getElementById('_ms_footer');
        if (!ft) return;
        var c = UI.colors();
        var total = State.listFor(kind).length;
        var selList = [];
        for (var i = 0; i < list.length; i++) if (State.selected.has(list[i])) selList.push(list[i]);
        var selCount = selList.length;
        var displayList = list || [];

        ft.innerHTML = '';
        var info = document.createElement('div');
        info.style.cssText = 'font-size:12px;color:' + c.sub + ';margin-bottom:6px;';
        info.textContent = LANG.t('selInfo', {sel: selCount, shown: displayList.length, total: total});
        ft.appendChild(info);

        var wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
        function btn(label, color, handler, flex) {
            var b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = (flex ? 'flex:' + flex + ';' : 'flex:1;') + 'min-width:60px;padding:8px 10px;border:none;border-radius:8px;background:' + color + ';color:#fff;font-size:12px;font-weight:600;cursor:pointer;';
            b.addEventListener('click', handler);
            wrap.appendChild(b);
        }
        btn(LANG.t('selectAllBtn'), c.bg3, function () {
            var ls = State.listFor(kind);
            for (var i = 0; i < ls.length; i++) State.selected.add(ls[i]);
            UI.renderMedia(kind);
        });
        btn(LANG.t('invertSel'), c.bg3, function () {
            var ls = State.listFor(kind);
            for (var i = 0; i < ls.length; i++) {
                if (State.selected.has(ls[i])) State.selected.delete(ls[i]);
                else State.selected.add(ls[i]);
            }
            UI.renderMedia(kind);
        });
        btn(LANG.t('clearSel'), '#64748b,#94a3b8', function () {
            State.selected.clear();
            UI.renderMedia(kind);
        });
        btn(LANG.t('copyN', {n: selCount}), '#10b981,#34d399', function () {
            var picked = selList.length > 0 ? selList : State.listFor(kind);
            copyText(picked.join('\n'));
        }, 1.3);
        btn(LANG.t('downloadN', {n: selCount}), '#6366f1,#8b5cf6', function () {
            var picked = selList.length > 0 ? selList : State.listFor(kind);
            if (!picked || picked.length === 0) { toast(LANG.t('plsCheck'), '#f59e0b'); return; }
            // 显示进度条
            var progEl = document.getElementById('_ms_progress');
            if (progEl) progEl.style.display = 'block';
            Dl.batch(picked, kind, UI.updateProgress, function (result) {
                if (progEl) progEl.style.display = 'none';
            });
        }, 1.5);
        btn(LANG.t('genScript'), '#f59e0b,#fbbf24', function () {
            var picked = selList.length > 0 ? selList : State.listFor(kind);
            var script = Dl.generateScript(picked, 'aria2');
            copyText(script);
            toast(LANG.t('scriptCopied'));
        });
        btn(LANG.t('rescan'), '#475569,#64748b', function () {
            Scanner.doFull(function () { toast(LANG.t('rescanDone')); UI.renderMedia(kind); });
        });
        ft.appendChild(wrap);
    };

    // ===== 翻译 Tab =====
    UI.renderTranslate = function () {
        var box = document.getElementById('_ms_box');
        if (!box) return;
        var c = UI.colors();
        box.innerHTML = '';
        var container = document.createElement('div');
        container.style.cssText = 'padding:14px 16px;';

        var intro = document.createElement('div');
        intro.style.cssText = 'padding:14px 16px;border-radius:14px;background:' + c.bg2 + ';border:1px solid ' + c.border + ';margin-bottom:14px;font-size:12px;color:' + c.sub + ';line-height:1.8;';
        intro.innerHTML = '<div style="font-size:14px;font-weight:600;color:' + c.txt + ';margin-bottom:6px;">' + LANG.t('transTitle') + '</div>' +
            LANG.t('transIntro');
        container.appendChild(intro);

        var langRow = document.createElement('div');
        langRow.style.cssText = 'display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;';
        function makeLangSelect(value, onChange) {
            var sel = document.createElement('select');
            sel.style.cssText = 'flex:1;min-width:120px;padding:8px 10px;border:1px solid ' + c.border + ';border-radius:8px;background:' + c.bg + ';color:' + c.txt + ';font-size:13px;font-family:inherit;';
            var opts = [
                ['auto', LANG.t('autoDetect')],
                ['zh-CN', LANG.t('zhLang')],
                ['en', LANG.t('enLang')],
                ['ja', LANG.t('jaLang')],
                ['ko', LANG.t('koLang')],
                ['fr', LANG.t('frLang')],
                ['de', LANG.t('deLang')],
                ['es', LANG.t('esLang')],
                ['ru', LANG.t('ruLang')]
            ];
            for (var i = 0; i < opts.length; i++) {
                var opt = document.createElement('option');
                opt.value = opts[i][0]; opt.textContent = opts[i][1];
                if (opts[i][0] === value) opt.selected = true;
                sel.appendChild(opt);
            }
            sel.addEventListener('change', function () { onChange(sel.value); });
            return sel;
        }
        var fromSel = makeLangSelect(State.config.translateFrom, function (v) { State.config.translateFrom = v; State.save(); });
        var arrow = document.createElement('div');
        arrow.style.cssText = 'padding:8px 4px;color:' + c.sub + ';font-weight:700;font-size:16px;';
        arrow.textContent = '→';
        var toSel = makeLangSelect(State.config.translateTo, function (v) { State.config.translateTo = v; State.save(); });
        langRow.appendChild(fromSel); langRow.appendChild(arrow); langRow.appendChild(toSel);
        container.appendChild(langRow);

        var input = document.createElement('textarea');
        input.placeholder = LANG.t('transInputPh');
        input.style.cssText = 'width:100%;min-height:130px;padding:10px 12px;border:1px solid ' + c.border + ';border-radius:10px;font-size:13px;line-height:1.6;background:' + c.bg + ';color:' + c.txt + ';font-family:inherit;box-sizing:border-box;resize:vertical;';
        container.appendChild(input);

        var btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;margin-top:10px;margin-bottom:14px;flex-wrap:wrap;';
        function makeBtn(label, bg, handler) {
            var b = document.createElement('button');
            b.textContent = label; b.style.cssText = 'flex:1;min-width:110px;padding:10px 12px;border:none;border-radius:10px;background:' + bg + ';color:#fff;font-size:13px;font-weight:600;cursor:pointer;';
            b.addEventListener('click', handler); btnRow.appendChild(b);
        }
        makeBtn(LANG.t('transBtn'), 'linear-gradient(135deg,#6366f1,#8b5cf6)', function () { doTranslate(false); });
        makeBtn(LANG.t('zhToEn'), '#f59e0b', function () { fromSel.value = 'zh-CN'; toSel.value = 'en'; State.config.translateFrom = 'zh-CN'; State.config.translateTo = 'en'; State.save(); doTranslate(false); });
        makeBtn(LANG.t('enToZh'), '#10b981', function () { fromSel.value = 'en'; toSel.value = 'zh-CN'; State.config.translateFrom = 'en'; State.config.translateTo = 'zh-CN'; State.save(); doTranslate(false); });
        makeBtn(LANG.t('clearBtn'), '#475569', function () { input.value = ''; output.textContent = LANG.t('transResultPh'); statusEl.textContent = ''; });
        container.appendChild(btnRow);

        var statusEl = document.createElement('div');
        statusEl.style.cssText = 'font-size:12px;color:' + c.sub + ';margin-bottom:8px;';
        container.appendChild(statusEl);

        var output = document.createElement('div');
        output.style.cssText = 'padding:14px 16px;border-radius:10px;background:' + c.bg2 + ';border:2px dashed ' + c.border + ';color:' + c.txt + ';font-size:14px;line-height:1.8;word-break:break-word;white-space:pre-wrap;min-height:80px;';
        output.textContent = LANG.t('transResultPh');
        container.appendChild(output);

        var btnRow2 = document.createElement('div');
        btnRow2.style.cssText = 'display:flex;gap:8px;margin-top:10px;margin-bottom:18px;';
        makeBtn(LANG.t('copyResult'), '#6366f1', function () { copyText(output.textContent || ''); });
        makeBtn(LANG.t('resultAsInput'), '#10b981', function () { if (output.textContent && output.textContent !== LANG.t('transResultPh')) input.value = output.textContent; });
        container.appendChild(btnRow2);

        box.appendChild(container);

        function doTranslate(isAuto) {
            var text = (input.value || '').trim();
            if (!text) { statusEl.textContent = LANG.t('plsInputText'); statusEl.style.color = '#f59e0b'; return; }
            var from = isAuto ? 'auto' : fromSel.value;
            var to = toSel.value;
            statusEl.textContent = LANG.t('translating', {from: from, to: to});
            statusEl.style.color = '#6366f1';
            output.textContent = LANG.t('translatingShort');
            Translator.translate(text, from, to, function (result, err) {
                if (err) { statusEl.textContent = LANG.t('transFail') + ': ' + err; statusEl.style.color = '#ef4444'; output.textContent = LANG.t('transFailShort') + err; }
                else { statusEl.textContent = LANG.t('transDone') + new Date().toLocaleTimeString(); statusEl.style.color = '#10b981'; output.textContent = result; }
            });
        }
    };

    // ===== Cookie Tab =====
    UI.renderCookie = function () {
        var box = document.getElementById('_ms_box');
        if (!box) return;
        var c = UI.colors();
        box.innerHTML = '';
        var container = document.createElement('div');
        container.style.cssText = 'padding:12px 14px;';

        var btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;';
        function mkBtn(label, color, handler, flex) {
            var b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = (flex ? 'flex:' + flex + ';' : 'flex:1;') + 'min-width:110px;padding:10px 12px;border:none;border-radius:10px;background:linear-gradient(135deg,' + color + ');color:#fff;font-size:13px;font-weight:600;cursor:pointer;';
            b.addEventListener('click', handler); btnRow.appendChild(b);
        }
        mkBtn(LANG.t('copyCookieStr'), '#6366f1,#8b5cf6', function () { try { copyText(document.cookie || '（空）'); } catch (e) { toast(LANG.t('readCookieFail'), '#ef4444'); } });
        mkBtn(LANG.t('copyJson'), '#10b981,#34d399', function () { var pairs = parseCookies(); copyText(JSON.stringify(pairs, null, 2)); });
        mkBtn(LANG.t('addCookie'), '#f59e0b,#fbbf24', function () {
            var name = prompt(LANG.t('cookieName'));
            if (!name) return;
            var val = prompt(LANG.t('cookieValue'));
            if (val == null) return;
            try { document.cookie = name + '=' + val + ';path=/;domain=' + location.hostname; toast(LANG.t('added')); UI.renderCookie(); } catch (e) { toast(LANG.t('addFail') + ': ' + e.message, '#ef4444'); }
        });
        mkBtn(LANG.t('clearSite'), '#ef4444,#f87171', function () {
            if (!confirm(LANG.t('confirmClearCookie'))) return;
            try {
                var cur = document.cookie || '';
                if (cur) {
                    var arr = cur.split(';');
                    for (var i = 0; i < arr.length; i++) {
                        var idx = arr[i].indexOf('=');
                        if (idx < 0) continue;
                        var nm = arr[i].substring(0, idx).trim();
                        document.cookie = nm + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + location.hostname;
                        document.cookie = nm + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
                    }
                }
                toast(LANG.t('clearedRefresh')); UI.renderCookie();
            } catch (e) { toast(LANG.t('clearFail') + ': ' + e.message, '#ef4444'); }
        });
        container.appendChild(btnRow);

        var pairs = parseCookies();
        if (pairs.length === 0) {
            var empty = document.createElement('div');
            empty.style.cssText = 'padding:40px;text-align:center;color:' + c.sub + ';font-size:14px;';
            empty.textContent = LANG.t('noCookie');
            container.appendChild(empty);
        } else {
            for (var i = 0; i < pairs.length; i++) {
                (function (p) {
                    var row = document.createElement('div');
                    row.style.cssText = 'padding:10px 12px;margin-bottom:6px;background:' + c.bg2 + ';border-radius:8px;border-left:3px solid #6366f1;';
                    var top = document.createElement('div');
                    top.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;';
                    var name = document.createElement('div');
                    name.style.cssText = 'flex:1;min-width:0;word-break:break-all;color:#6366f1;font-weight:700;font-size:12px;';
                    name.textContent = p.name;
                    var del = document.createElement('button');
                    del.textContent = LANG.t('delete');
                    del.style.cssText = 'padding:4px 10px;border:none;border-radius:6px;background:#ef4444;color:#fff;font-size:11px;cursor:pointer;flex-shrink:0;';
                    del.addEventListener('click', function () {
                        try {
                            document.cookie = p.name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + location.hostname;
                            toast(LANG.t('done') + ': ' + p.name); UI.renderCookie();
                        } catch (e) { toast(LANG.t('delFail') + ': ' + e.message, '#ef4444'); }
                    });
                    top.appendChild(name); top.appendChild(del);
                    row.appendChild(top);
                    var val = document.createElement('div');
                    val.style.cssText = 'font-size:12px;color:' + c.sub + ';word-break:break-all;font-family:monospace;';
                    val.textContent = p.value;
                    row.appendChild(val);
                    container.appendChild(row);
                })(pairs[i]);
            }
        }
        box.appendChild(container);
    };
    function parseCookies() {
        var out = [];
        try {
            var raw = document.cookie || '';
            if (!raw) return out;
            var arr = raw.split(';');
            for (var i = 0; i < arr.length; i++) {
                var idx = arr[i].indexOf('=');
                if (idx >= 0) out.push({ name: arr[i].substring(0, idx).trim(), value: arr[i].substring(idx + 1).trim() });
            }
        } catch (e) {}
        return out;
    }

    // ===== Storage Tab =====
    UI.renderStorage = function () {
        var box = document.getElementById('_ms_box');
        if (!box) return;
        var c = UI.colors();
        box.innerHTML = '';
        var container = document.createElement('div');
        container.style.cssText = 'padding:12px 14px;';

        var btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;';
        function mkBtn(label, color, handler) {
            var b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = 'flex:1;min-width:110px;padding:10px 12px;border:none;border-radius:10px;background:linear-gradient(135deg,' + color + ');color:#fff;font-size:13px;font-weight:600;cursor:pointer;';
            b.addEventListener('click', handler); btnRow.appendChild(b);
        }
        mkBtn(LANG.t('exportLs'), '#6366f1,#8b5cf6', function () { var items = readStorage('ls'); copyText(JSON.stringify(items, null, 2)); });
        mkBtn(LANG.t('exportSs'), '#10b981,#34d399', function () { var items = readStorage('ss'); copyText(JSON.stringify(items, null, 2)); });
        mkBtn(LANG.t('addItem'), '#f59e0b,#fbbf24', function () {
            var k = prompt(LANG.t('keyName')); if (!k) return;
            var v = prompt(LANG.t('keyValue')); if (v == null) return;
            try { localStorage.setItem(k, v); toast(LANG.t('addToLs')); UI.renderStorage(); }
            catch (e) { toast(LANG.t('addFail') + ': ' + e.message, '#ef4444'); }
        });
        mkBtn(LANG.t('clearAll'), '#ef4444,#f87171', function () {
            if (!confirm(LANG.t('confirmClearStorage'))) return;
            try { localStorage.clear(); sessionStorage.clear(); toast(LANG.t('cleared')); UI.renderStorage(); }
            catch (e) { toast(LANG.t('clearFail') + ': ' + e.message, '#ef4444'); }
        });
        container.appendChild(btnRow);

        function readStorage(scope) {
            var out = [];
            try {
                var s = scope === 'ls' ? localStorage : sessionStorage;
                for (var i = 0; i < s.length; i++) {
                    var k = s.key(i);
                    out.push({ key: k, value: s.getItem(k) });
                }
            } catch (e) {}
            return out;
        }

        var ls = readStorage('ls'), ss = readStorage('ss');
        var info = document.createElement('div');
        info.style.cssText = 'padding:12px;border-radius:10px;background:' + c.bg2 + ';font-size:12px;color:' + c.sub + ';margin-bottom:12px;';
        info.textContent = LANG.t('lsCount', {n: ls.length, m: ss.length});
        container.appendChild(info);

        function renderSection(title, items, scope) {
            if (items.length === 0) return;
            var h = document.createElement('div');
            h.style.cssText = 'font-weight:700;color:' + c.txt + ';margin:14px 0 6px;font-size:13px;';
            h.textContent = title + '（' + items.length + '）';
            container.appendChild(h);
            for (var i = 0; i < items.length; i++) {
                (function (it) {
                    var row = document.createElement('div');
                    row.style.cssText = 'padding:10px 12px;margin-bottom:6px;background:' + c.bg2 + ';border-radius:8px;border-left:3px solid #6366f1;';
                    var top = document.createElement('div');
                    top.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;';
                    var name = document.createElement('div');
                    name.style.cssText = 'flex:1;min-width:0;word-break:break-all;color:#6366f1;font-weight:700;font-size:12px;';
                    name.textContent = it.key;
                    var del = document.createElement('button');
                    del.textContent = LANG.t('delete');
                    del.style.cssText = 'padding:4px 10px;border:none;border-radius:6px;background:#ef4444;color:#fff;font-size:11px;cursor:pointer;flex-shrink:0;';
                    del.addEventListener('click', function () {
                        try {
                            if (scope === 'ls') localStorage.removeItem(it.key); else sessionStorage.removeItem(it.key);
                            toast(LANG.t('done')); UI.renderStorage();
                        } catch (e) { toast(LANG.t('delFail'), '#ef4444'); }
                    });
                    top.appendChild(name); top.appendChild(del);
                    row.appendChild(top);
                    var val = document.createElement('div');
                    val.style.cssText = 'font-size:12px;color:' + c.sub + ';word-break:break-all;font-family:monospace;max-height:100px;overflow:auto;';
                    val.textContent = U.trunc(it.value, 500);
                    row.appendChild(val);
                    container.appendChild(row);
                })(items[i]);
            }
        }
        renderSection(LANG.t('lsTitle'), ls, 'ls');
        renderSection(LANG.t('ssTitle'), ss, 'ss');

        box.appendChild(container);
    };

    // ===== 设置 Tab =====
    UI.renderSettings = function () {
        var box = document.getElementById('_ms_box');
        if (!box) return;
        var c = UI.colors();
        box.innerHTML = '';
        var container = document.createElement('div');
        container.style.cssText = 'padding:12px 14px;';

        // 主题
        var themeBox = document.createElement('div');
        themeBox.style.cssText = 'padding:14px;border-radius:12px;background:' + c.bg2 + ';border:1px solid ' + c.border + ';margin-bottom:14px;';
        themeBox.innerHTML = '<div style="font-size:13px;font-weight:600;color:' + c.txt + ';margin-bottom:8px;">🎨 ' + LANG.t('themeSelect') + '</div>';
        var themeRow = document.createElement('div');
        themeRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
        var themes = [['auto', '🖥 ' + LANG.t('themeAuto')], ['light', '☀ ' + LANG.t('themeLight')], ['dark', '🌙 ' + LANG.t('themeDark')]];
        for (var ti = 0; ti < themes.length; ti++) {
            (function (t) {
                var b = document.createElement('button');
                b.textContent = t[1];
                var active = State.config.theme === t[0];
                b.style.cssText = 'flex:1;min-width:90px;padding:10px;border:none;border-radius:10px;background:' + (active ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : c.bg3) + ';color:' + (active ? '#fff' : c.txt) + ';font-size:13px;font-weight:600;cursor:pointer;' + (active ? 'box-shadow:0 4px 12px rgba(99,102,241,.3);' : '');
                b.addEventListener('click', function () { State.config.theme = t[0]; State.save(); applyPanelThemeNow(); UI.renderSettings(); toast(LANG.t('saved')); });
                themeRow.appendChild(b);
            })(themes[ti]);
        }
        themeBox.appendChild(themeRow);
        container.appendChild(themeBox);

        // 下载文件名模板
        var tplBox = document.createElement('div');
        tplBox.style.cssText = 'padding:14px;border-radius:12px;background:' + c.bg2 + ';border:1px solid ' + c.border + ';margin-bottom:14px;';
        tplBox.innerHTML = '<div style="font-size:13px;font-weight:600;color:' + c.txt + ';margin-bottom:6px;">📝 ' + LANG.t('nameTpl') + '</div>';
        var tplInput = document.createElement('input');
        tplInput.type = 'text';
        tplInput.value = State.config.nameTpl;
        tplInput.style.cssText = 'width:100%;padding:8px 10px;border:1px solid ' + c.border + ';border-radius:8px;font-size:13px;background:' + c.bg + ';color:' + c.txt + ';box-sizing:border-box;';
        tplInput.addEventListener('change', function () { State.config.nameTpl = tplInput.value || '{域名}_{日期}_{序号}_{后缀}'; State.save(); toast(LANG.t('saved')); });
        tplBox.appendChild(tplInput);
        container.appendChild(tplBox);

        // 批量下载设置
        var batchBox = document.createElement('div');
        batchBox.style.cssText = 'padding:14px;border-radius:12px;background:' + c.bg2 + ';border:1px solid ' + c.border + ';margin-bottom:14px;';
        batchBox.innerHTML = '<div style="font-size:13px;font-weight:600;color:' + c.txt + ';margin-bottom:8px;">⬇ ' + LANG.t('batchTitle') + '</div>';
        var confRow = document.createElement('div');
        confRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;';
        function numSetting(label, key, min, max, step) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;';
            var lab = document.createElement('label');
            lab.style.cssText = 'font-size:12px;color:' + c.sub + ';';
            lab.textContent = label;
            var inp = document.createElement('input');
            inp.type = 'number'; inp.min = min; inp.max = max; inp.step = step; inp.value = State.config[key];
            inp.style.cssText = 'width:70px;padding:5px 8px;border:1px solid ' + c.border + ';border-radius:6px;background:' + c.bg + ';color:' + c.txt + ';font-size:12px;';
            inp.addEventListener('change', function () {
                var v = parseFloat(inp.value);
                if (!isNaN(v) && v >= min && v <= max) { State.config[key] = v; State.save(); toast(LANG.t('saved')); }
            });
            row.appendChild(lab); row.appendChild(inp); confRow.appendChild(row);
        }
        numSetting(LANG.t('concurrency'), 'batchConcurrency', 1, 8, 1);
        numSetting(LANG.t('intervalMs'), 'batchDelay', 50, 5000, 100);
        numSetting(LANG.t('retries'), 'batchRetry', 0, 5, 1);
        batchBox.appendChild(confRow);
        container.appendChild(batchBox);

        // m3u8 设置
        var m3u8Box = document.createElement('div');
        m3u8Box.style.cssText = 'padding:14px;border-radius:12px;background:' + c.bg2 + ';border:1px solid ' + c.border + ';margin-bottom:14px;';
        m3u8Box.innerHTML = '<div style="font-size:13px;font-weight:600;color:' + c.txt + ';margin-bottom:8px;">📺 ' + LANG.t('m3u8Settings') + '</div>';
        var m3u8Row = document.createElement('div');
        m3u8Row.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;';
        var qualitySel = document.createElement('select');
        qualitySel.style.cssText = 'padding:8px 10px;border:1px solid ' + c.border + ';border-radius:8px;background:' + c.bg + ';color:' + c.txt + ';font-size:12px;';
        var qOpts = [
            ['auto', LANG.t('qualityAuto')],
            ['high', LANG.t('qualityHigh')],
            ['medium', LANG.t('qualityMedium')],
            ['low', LANG.t('qualityLow')]
        ];
        for (var qi = 0; qi < qOpts.length; qi++) {
            var opt = document.createElement('option');
            opt.value = qOpts[qi][0]; opt.textContent = qOpts[qi][1];
            if (qOpts[qi][0] === State.config.m3u8Quality) opt.selected = true;
            qualitySel.appendChild(opt);
        }
        qualitySel.addEventListener('change', function () { State.config.m3u8Quality = qualitySel.value; State.save(); toast(LANG.t('saved')); });
        var qLabel = document.createElement('label');
        qLabel.style.cssText = 'font-size:12px;color:' + c.sub + ';';
        qLabel.textContent = LANG.t('qualityLabel');
        m3u8Row.appendChild(qLabel); m3u8Row.appendChild(qualitySel);
        var segLabel = LANG.t('segmentsLabel');
        numSetting(segLabel, 'm3u8Concurrency', 1, 8, 1);
        m3u8Box.appendChild(m3u8Row);
        container.appendChild(m3u8Box);

        // 自定义请求头（P1-4）
        var headersBox = document.createElement('div');
        headersBox.style.cssText = 'padding:14px;border-radius:12px;background:' + c.bg2 + ';border:1px solid ' + c.border + ';margin-bottom:14px;';
        headersBox.innerHTML = '<div style="font-size:13px;font-weight:600;color:' + c.txt + ';margin-bottom:8px;">' + LANG.t('requestHeaders') + '</div>';
        function headerInput(label, key) {
            var row = document.createElement('div');
            row.style.cssText = 'margin-bottom:8px;';
            var lab = document.createElement('label');
            lab.style.cssText = 'font-size:12px;color:' + c.txt + ';display:block;margin-bottom:4px;';
            lab.textContent = label;
            var inp = document.createElement('input');
            inp.type = 'text';
            inp.value = State.config.customHeaders[key] || '';
            inp.style.cssText = 'width:100%;padding:8px 10px;border:1px solid ' + c.border + ';border-radius:8px;font-size:12px;background:' + c.bg + ';color:' + c.txt + ';box-sizing:border-box;';
            inp.addEventListener('change', function () { State.config.customHeaders[key] = inp.value; State.save(); toast(LANG.t('saved')); });
            row.appendChild(lab); row.appendChild(inp);
            return row;
        }
        headersBox.appendChild(headerInput(LANG.t('referer'), 'Referer'));
        headersBox.appendChild(headerInput(LANG.t('userAgent'), 'UserAgent'));
        headersBox.appendChild(headerInput(LANG.t('cookie'), 'Cookie'));
        container.appendChild(headersBox);

        // 日志级别（P2-2）
        var logBox = document.createElement('div');
        logBox.style.cssText = 'padding:14px;border-radius:12px;background:' + c.bg2 + ';border:1px solid ' + c.border + ';margin-bottom:14px;';
        logBox.innerHTML = '<div style="font-size:13px;font-weight:600;color:' + c.txt + ';margin-bottom:8px;">' + LANG.t('logLevelTitle') + '</div>';
        var logSel = document.createElement('select');
        logSel.style.cssText = 'padding:8px 10px;border:1px solid ' + c.border + ';border-radius:8px;background:' + c.bg + ';color:' + c.txt + ';font-size:12px;';
        var logOpts = [[0, LANG.t('logDebug')], [1, LANG.t('logInfo')], [2, LANG.t('logWarn')], [3, LANG.t('logError')]];
        for (var li = 0; li < logOpts.length; li++) {
            var opt = document.createElement('option');
            opt.value = logOpts[li][0]; opt.textContent = logOpts[li][1];
            if (logOpts[li][0] === State.config.logLevel) opt.selected = true;
            logSel.appendChild(opt);
        }
        logSel.addEventListener('change', function () { State.config.logLevel = parseInt(logSel.value, 10); LOG.setLevel(State.config.logLevel); State.save(); toast(LANG.t('logLevelChanged')); });
        logBox.appendChild(logSel);
        container.appendChild(logBox);

        // 其他操作
        var otherBox = document.createElement('div');
        otherBox.style.cssText = 'padding:14px;border-radius:12px;background:' + c.bg2 + ';border:1px solid ' + c.border + ';margin-bottom:14px;';
        otherBox.innerHTML = '<div style="font-size:13px;font-weight:600;color:' + c.txt + ';margin-bottom:8px;">' + LANG.t('otherOps') + '</div>';
        var ob = document.createElement('div');
        ob.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
        function mkOBtn(label, color, handler, flex) {
            var b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = (flex ? 'flex:' + flex + ';' : 'flex:1;') + 'min-width:100px;padding:10px 12px;border:none;border-radius:10px;background:' + color + ';color:#fff;font-size:13px;cursor:pointer;font-weight:600;';
            b.addEventListener('click', handler); ob.appendChild(b);
        }
        mkOBtn(LANG.t('rescan'), 'linear-gradient(135deg,#6366f1,#8b5cf6)', function () { Scanner.doFull(function () { toast(LANG.t('rescanDone')); UI.renderMedia(State.tab); }); });
        mkOBtn(LANG.t('exportAllConfig'), '#10b981', function () { copyText(State.exportConfig()); }, 1.3);
        mkOBtn(LANG.t('importConfig'), '#f59e0b', function () {
            var t = prompt(LANG.t('pasteJson'));
            if (!t) return;
            var res = State.importConfig(t);
            if (res.ok) { toast('✅ ' + res.msg); applyPanelThemeNow(); UI.renderSettings(); }
            else toast('❌ ' + res.msg, '#ef4444');
        }, 1.3);
        mkOBtn(LANG.t('resetAll'), '#ef4444', function () {
            if (!confirm(LANG.t('confirmReset'))) return;
            State.resetConfig(); applyPanelThemeNow(); toast(LANG.t('resetDone')); UI.renderSettings();
        }, 1.2);
        otherBox.appendChild(ob);
        container.appendChild(otherBox);

        // 界面语言
        var langBox = document.createElement('div');
        langBox.style.cssText = 'background:' + c.bg2 + ';border-radius:10px;padding:12px;margin-bottom:12px;';
        langBox.innerHTML = '<div style="font-size:13px;font-weight:700;margin-bottom:8px;color:' + c.txt + ';">🌍 ' + LANG.t('langSelect') + '</div>';
        var langContainer = document.createElement('div');
        langContainer.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
        var langs = [['zh-CN', '简体中文'], ['en-US', 'English'], ['ja-JP', '日本語'], ['ko-KR', '한국어']];
        for (var li = 0; li < langs.length; li++) {
            (function (l) {
                var lb = document.createElement('button');
                lb.textContent = l[1] + ' (' + l[0] + ')';
                lb.style.cssText = 'padding:8px 14px;border:none;border-radius:8px;background:' + (State.config.uiLang === l[0] ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : c.bg3) + ';color:' + (State.config.uiLang === l[0] ? '#fff' : c.sub) + ';font-size:12px;font-weight:' + (State.config.uiLang === l[0] ? '700' : '500') + ';cursor:pointer;';
                lb.onclick = function () { 
                    State.config.uiLang = l[0]; 
                    State.save(); 
                    toast(LANG.t('saved')); 
                    if (State.panel) {
                        var wasOpen = State.panel.classList.contains('_ms_open');
                        State.panel.remove();
                        State.panel = null;
                        UI.createPanel();
                        if (wasOpen) State.panel.classList.add('_ms_open');
                        UI.switchTab(State.tab || 'img');
                    }
                };
                langContainer.appendChild(lb);
            })(langs[li]);
        }
        langBox.appendChild(langContainer);
        container.appendChild(langBox);

        // 域名规则
        var drBox = document.createElement('div');
        drBox.style.cssText = 'background:' + c.bg2 + ';border-radius:10px;padding:12px;margin-bottom:12px;';
        drBox.innerHTML = '<div style="font-size:13px;font-weight:700;margin-bottom:8px;color:' + c.txt + ';">⚙ ' + LANG.t('domainRules') + '</div>';
        var drText = document.createElement('textarea');
        drText.style.cssText = 'width:100%;min-height:80px;padding:8px;border:1px solid ' + c.border + ';border-radius:8px;background:' + c.bg + ';color:' + c.txt + ';font-size:12px;font-family:monospace;box-sizing:border-box;resize:vertical;';
        var drLines = [];
        if (State.config.domainRules && State.config.domainRules.length > 0) {
            for (var di = 0; di < State.config.domainRules.length; di++) {
                var r = State.config.domainRules[di];
                drLines.push((r.domain || '') + ',' + (r.img ? 1 : 0) + ',' + (r.video ? 1 : 0) + ',' + (r.audio ? 1 : 0) + ',' + (r.depth || 1));
            }
        }
        drText.value = drLines.join('\n');
        drBox.appendChild(drText);
        var drBtn = document.createElement('button');
        drBtn.textContent = '💾 ' + LANG.t('saveRules');
        drBtn.style.cssText = 'margin-top:8px;padding:8px 14px;border:none;border-radius:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:12px;font-weight:600;cursor:pointer;';
        drBtn.onclick = function () {
            var lines = drText.value.split(/[\r\n]+/).filter(function (l) { return l.trim().length > 0; });
            var rules = [];
            for (var ri = 0; ri < lines.length; ri++) {
                var parts = lines[ri].split(',').map(function (p) { return p.trim(); });
                if (parts.length >= 2) {
                    rules.push({
                        domain: parts[0],
                        img: parseInt(parts[1], 10) === 1,
                        video: parts.length > 2 ? parseInt(parts[2], 10) === 1 : true,
                        audio: parts.length > 3 ? parseInt(parts[3], 10) === 1 : true,
                        depth: parts.length > 4 ? Math.max(0, Math.min(2, parseInt(parts[4], 10) || 1)) : 1
                    });
                }
            }
            State.config.domainRules = rules;
            State.save();
            toast(LANG.t('rulesSaved', { n: rules.length }));
            UI.renderSettings();
        };
        drBox.appendChild(drBtn);
        container.appendChild(drBox);

        // 视频封面选项
        var thumbBox = document.createElement('div');
        thumbBox.style.cssText = 'background:' + c.bg2 + ';border-radius:10px;padding:12px;margin-bottom:12px;';
        thumbBox.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;"><div><div style="font-size:13px;font-weight:700;color:' + c.txt + ';">🎞 ' + LANG.t('autoThumb') + '</div><div style="font-size:11px;color:' + c.sub + ';margin-top:2px;">' + LANG.t('autoThumbDesc') + '</div></div></div>';
        var thumbCheck = document.createElement('button');
        var thumbState = State.config.autoExtractThumb ? LANG.t('enabled') : LANG.t('disabled');
        thumbCheck.textContent = thumbState;
        thumbCheck.style.cssText = 'margin-top:8px;padding:8px 14px;border:none;border-radius:8px;background:' + (State.config.autoExtractThumb ? 'linear-gradient(135deg,#10b981,#34d399)' : c.bg3) + ';color:' + (State.config.autoExtractThumb ? '#fff' : c.sub) + ';font-size:12px;font-weight:600;cursor:pointer;';
        thumbCheck.onclick = function () { State.config.autoExtractThumb = !State.config.autoExtractThumb; State.save(); UI.renderSettings(); };
        thumbBox.appendChild(thumbCheck);
        container.appendChild(thumbBox);

        var info = document.createElement('div');
        info.style.cssText = 'padding:12px;border-radius:10px;background:' + c.bg2 + ';font-size:11px;color:' + c.sub + ';line-height:1.8;text-align:center;';
        info.innerHTML = LANG.t('infoLine1') + '<br/>' + LANG.t('infoLine2');
        container.appendChild(info);

        box.appendChild(container);
    };

    // 即时应用主题
    function applyPanelThemeNow() {
        if (!State.panel) return;
        var c = UI.colors();
        State.panel.style.background = c.bg;
        State.panel.style.color = c.txt;
        var tabs = document.querySelector('#_ms_tabs');
        if (tabs) tabs.style.background = c.bg2;
        var box = document.getElementById('_ms_box');
        if (box) box.style.background = c.bg;
        var footer = document.getElementById('_ms_footer');
        if (footer) footer.style.background = c.bg;
        State._applyTheme = applyPanelThemeNow;
    }

    // 注册渲染防抖
    State._renderThrottled = U.throttle(function () { UI.renderMedia(State.tab); }, 400);

    UI.registerShortcuts = function () {
        document.addEventListener('keydown', function (e) {
            if (e.altKey && (e.key === 't' || e.key === 'T')) {
                e.preventDefault();
                var text = '';
                try { text = (window.getSelection().toString() || '').trim(); } catch (err) {}
                if (!text) { toast(LANG.t('plsSelectText'), '#f59e0b'); UI.openPanel(); UI.switchTab('translate'); return; }
                UI.openPanel();
                setTimeout(function () {
                    UI.switchTab('translate');
                    var inp = document.querySelector('#_ms_box textarea');
                    if (inp) inp.value = text;
                    Translator.autoTranslate(text, function (result, err) {
                        var outputs = document.querySelectorAll('#_ms_box div');
                        for (var i = 0; i < outputs.length; i++) {
                            if (outputs[i].textContent && outputs[i].textContent.indexOf('翻译结果') === 0) {
                                outputs[i].textContent = err ? LANG.t('transFailShort') + err : result;
                                break;
                            }
                        }
                        toast(err ? '❌ 翻译失败' : LANG.t('transDone'));
                    });
                }, 250);
            }
            else if (e.altKey && (e.key === 'b' || e.key === 'B')) {
                e.preventDefault();
                if (State.panelOpen) UI.closePanel(); else UI.openPanel();
            }
            else if (e.key === 'Escape' && State.panelOpen) {
                UI.closePanel();
            }
        });
        LOG.info('快捷键已注册');
    };

    // =========================================================================
    // 💬 模块 14：选中文字翻译浮窗
    // =========================================================================
    UI.buildSelectionPopup = function () {
        if (document.getElementById('_ms_sel_pop')) return;
        var pop = document.createElement('div');
        pop.id = '_ms_sel_pop';
        pop.textContent = LANG.t('transSelText');
        pop.style.cssText = 'position:fixed;z-index:2147483647;padding:6px 14px;border-radius:18px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:13px;font-weight:600;box-shadow:0 6px 18px rgba(99,102,241,.5);cursor:pointer;font-family:system-ui,sans-serif;display:none;';
        pop.addEventListener('click', function () {
            var text = '';
            try { text = (window.getSelection().toString() || '').trim(); } catch (e) {}
            if (!text) { toast(LANG.t('plsSelectText'), '#f59e0b'); return; }
            UI.openPanel();
            setTimeout(function () {
                UI.switchTab('translate');
                var inp = document.querySelector('#_ms_box textarea');
                if (inp) inp.value = text;
                Translator.autoTranslate(text, function (result, err) {
                    if (err) toast(LANG.t('transFail') + ': ' + err, '#ef4444');
                    else {
                        var outputs = document.querySelectorAll('#_ms_box div');
                        for (var i = 0; i < outputs.length; i++) {
                            if (outputs[i].textContent && outputs[i].textContent.indexOf('翻译结果') === 0) {
                                outputs[i].textContent = result;
                                break;
                            }
                        }
                        toast(LANG.t('transDone'));
                    }
                });
            }, 250);
            pop.style.display = 'none';
        });
        document.documentElement.appendChild(pop);
    };

    UI._updateSelectionPopup = U.throttle(function () {
        var pop = document.getElementById('_ms_sel_pop');
        if (!pop) return;
        try {
            var selText = (window.getSelection().toString() || '').trim();
            if (!selText || selText.length < 2) { pop.style.display = 'none'; return; }
            var ae = document.activeElement;
            if (ae && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && (ae.type === 'text' || ae.type === 'search' || ae.type === 'password')))) {
                pop.style.display = 'none'; return;
            }
            var range = window.getSelection().getRangeAt(0);
            var rect = range.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) { pop.style.display = 'none'; return; }
            pop.style.display = 'block';
            pop.style.left = Math.min(window.innerWidth - 120, Math.max(8, rect.left + rect.width / 2 - 50)) + 'px';
            pop.style.top = Math.max(8, rect.top - 38) + 'px';
        } catch (e) { pop.style.display = 'none'; }
    }, 300);

    document.addEventListener('mouseup', function (e) {
        if (e.target && e.target.id === '_ms_sel_pop') return;
        setTimeout(UI._updateSelectionPopup, 50);
    });
    document.addEventListener('touchend', function () { setTimeout(UI._updateSelectionPopup, 100); });
    document.addEventListener('mousedown', function (e) {
        if (!e.target || (e.target.id !== '_ms_sel_pop' && !e.target.closest('#_ms_sel_pop'))) {
            var p = document.getElementById('_ms_sel_pop');
            if (p) p.style.display = 'none';
        }
    });

    // =========================================================================
    // 🚀 模块 15：初始化 + 轮询守护 + 动态内容适配
    // =========================================================================
    State.init = function () {
        if (window.top !== window.self) return false;

        var host = document.body || document.documentElement;
        if (!host || host.nodeType !== 1) return false;

        State.load();

        try { UI.buildFloatBtn(); } catch (e) { LOG.warn('构建浮动按钮失败:', e.message); }
        try { UI.buildSelectionPopup(); } catch (e) { LOG.warn('构建选区浮窗失败:', e.message); }
        try { UI.registerShortcuts(); } catch (e) { LOG.warn('注册快捷键失败:', e.message); }
        try { installNetHook(); } catch (e) { LOG.warn('网络拦截安装失败:', e.message); }

        LOG.info('初始化完成');
        return true;
    };

    // SPA 路由变化重新触发
    try {
        window.addEventListener('hashchange', function () { setTimeout(State.init, 300); });
        window.addEventListener('popstate', function () { setTimeout(State.init, 300); });
        // 动态内容适配：监听 DOM 变化（MutationObserver）
        var mo = new MutationObserver(U.debounce(function (mutations) {
            var hasNewMedia = false;
            for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                if (!added) continue;
                for (var j = 0; j < added.length; j++) {
                    var node = added[j];
                    if (node.nodeType !== 1) continue;
                    if (node.tagName === 'IMG' || node.tagName === 'VIDEO' || node.tagName === 'AUDIO' || node.tagName === 'SOURCE' || node.tagName === 'IFRAME' || node.tagName === 'EMBED') {
                        hasNewMedia = true;
                        break;
                    }
                    // 检查子元素
                    var children = node.querySelectorAll ? node.querySelectorAll('img, video, audio, source, iframe, embed') : [];
                    if (children.length > 0) { hasNewMedia = true; break; }
                }
                if (hasNewMedia) break;
            }
            if (hasNewMedia && State.panelOpen) {
                LOG.debug('检测到新媒体元素，触发扫描');
                Scanner.doFull(function () { State._renderThrottled(); });
            }
        }, 500));
        mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
        LOG.info('MutationObserver 已启动');
    } catch (e) { LOG.warn('MutationObserver 不可用:', e); }

    // 窗口 resize
    try {
        window.addEventListener('resize', U.throttle(function () {
            var b = UI._floatBtn || document.getElementById('_ms_float');
            if (!b) return;
            var x = parseFloat(b.style.left), y = parseFloat(b.style.top);
            if (!isNaN(x) && x > window.innerWidth - 66) b.style.left = (window.innerWidth - 66) + 'px';
            if (!isNaN(y) && y > window.innerHeight - 66) b.style.top = (window.innerHeight - 66) + 'px';
        }, 300));
    } catch (e) {}

    // 初始化 — document-end 时 body 已存在，直接执行
    State.init();

    // 兜底重试（SPA 页面可能延迟加载）
    setTimeout(State.init, 500);
    setTimeout(State.init, 1500);
    setTimeout(State.init, 3000);

    // window.load 兜底
    window.addEventListener('load', function () {
        setTimeout(State.init, 300);
        setTimeout(State.init, 1200);
    });
})();
