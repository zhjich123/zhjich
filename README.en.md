# 🎯 Media Sniffer Pro

> A powerful browser userscript that automatically sniffs media resources (images, videos, audio, streaming) on web pages, with one-click download and batch export support.

[![version](https://img.shields.io/badge/version-v8.6.0-purple.svg)](https://github.com/zhjich123/zhjich/releases/tag/v8.6.0)
[![license](https://img.shields.io/badge/license-Unlicense-green.svg)](LICENSE)
[![platform](https://img.shields.io/badge/platform-Tampermonkey%20%7C%20ScriptCat-blue.svg)](#)

[中文版本](README.md) | **English Version**

---

## ✨ Features

### 🖼 Image Sniffing
- Automatically scan all `<img>` tags on the page
- Scan CSS `background-image` images
- Lazy-loaded image auto-detection
- Filter by size/format
- Batch download

### 🎬 Video Sniffing
- Auto-detect page video elements
- Support MP4 / WebM / MOV formats
- **Auto-extract video cover thumbnails**
- **Smart video page link parsing** (Bilibili/Douyin/Kuaishou, etc.)
- Multi-quality switching (8K/4K/1080P/720P)

### 🔗 Video Page Link Parsing
Support one-click parsing for video page links from these platforms:

| Platform | Status | Description |
|----------|--------|-------------|
| 📺 Bilibili | ✅ Full Support | All qualities, multi-part, danmaku info |
| 🎵 Douyin (TikTok China) | ✅ Full Support | Watermark-free video extraction |
| ⚡ Kuaishou | ✅ Full Support | Watermark-free video extraction |
| 📕 Xiaohongshu | 🔧 In Development | Link recognition done |
| 📢 Weibo | 🔧 In Development | Link recognition done |
| 📘 Zhihu | 🔧 In Development | Link recognition done |
| 💬 WeChat Channels | 🔧 In Development | Link recognition done |

### 📱 Mobile Optimization
- Responsive design, perfect for mobile
- **Long-press card for action menu** (preview/copy/download/open)
- **Swipe down to close preview**
- **Double-tap player to play/pause**
- **Swipe left/right to switch quality**
- Floating button auto-edge-snap
- Bottom safe area support

### ⚡ Batch Parsing
- One-click parse all video links on current page
- Real-time progress bar + success/fail count
- Concurrency control to avoid rate limiting
- Auto-retry mechanism (exponential backoff)

### 🔄 Stability Enhancements
- Three-level API fallback
- 15-second timeout control
- 5-minute error cache
- Smart error classification (login/rate limit/region/membership)

### Other Features
- 🎵 Audio sniffing (MP3 / WAV / FLAC)
- 📺 Streaming media scan (M3U8 / HLS)
- 🍪 Cookie manager
- 💾 Storage viewer
- 🌐 Multi-language support (CN/EN/JA/KO)
- ⌨ Shortcut `Alt + B` to toggle
- 🖱 Draggable floating button

---

## 🚀 Installation

### Requirements
- Chrome / Edge / Firefox browser
- **Tampermonkey** or **ScriptCat** extension installed

### One-Click Install
1. Click the script file: [`media-sniffer-v8.6.0.user.js`](media-sniffer-v8.6.0.user.js)
2. Tampermonkey / ScriptCat will auto-detect and prompt for installation
3. Click "Install"

### Manual Install
1. Copy all script code
2. Open Tampermonkey → "Create a new script"
3. Select all and delete existing code, paste new code
4. `Ctrl + S` to save

---

## 📖 Usage

### Basic Operations
- **Click purple floating button** → Toggle sidebar
- **Drag purple button** → Move anywhere (auto-saved)
- **Single-click resource** → Preview
- **Double-click resource** → Direct download
- **Shift + Click** → Multi-select batch download
- **Shortcut** `Alt + B` → Quick toggle
- **Press Esc** → Close panel

### Video Link Parsing
1. Open video website homepage/list page
2. Click the purple button at bottom right
3. Switch to "Video" tab
4. Top area shows "Video Page Links" section
5. **Click a card** → Parse and preview
6. **Parse All** → Batch parse all videos

---

## 🔧 Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Auto-extract video thumbnails | On | Auto-extract first frame as cover |
| Show file size | On | Display resource file size |
| Batch download retries | 3 times | Auto-retry on download failure |
| Shortcut | Alt + B | Toggle panel |
| Interface language | Follow browser | CN/EN/JA/KO |

---

## 📝 Changelog

### v8.6.0 (2026-06-28)
- 🎉 **Stable Release**: Full code review and quality improvements
- 🐛 Fix: M3U8 stop download not working (`stopDownload` couldn't access local variable)
- 🐛 Fix: Version number inconsistency (header/U.VERSION/infoLine1 now unified)
- 🧹 Cleanup: Removed duplicate translation keys in language packs
- 🧹 Cleanup: Removed duplicate SPA route change listeners
- 🧹 Cleanup: Fixed extra double-semicolon syntax

### v8.6.0beta (2026-06-27)
- ✨ New: Batch video link parsing with progress bar
- ✨ New: Multi-quality switching support (8K/4K/1080P/720P)
- ✨ New: Deep mobile optimization (long-press menu/swipe-down/gestures)
- ✨ New: Multi-platform recognition (Xiaohongshu/Weibo/Zhihu/WeChat)
- ✨ New: Enhanced video info (views/likes/coins/favorites/danmaku)
- ✨ New: Three-level API fallback + exponential backoff retry + error cache
- ✨ New: Floating button auto-edge-snap
- 🔧 Optimized: Virtual list performance, smooth scrolling for 100+ items
- 🔧 Optimized: Added @connect domains to avoid CORS confirmation popups

### v8.5.0
- ✨ New: Smart video page link parsing
- ✨ New: Support for Bilibili/Douyin/Kuaishou platforms
- ✨ New: Preview popup, direct preview after parsing
- 🔧 Optimized: Video cover display logic

### v8.4.0beta
- ✨ New: Auto-extract video cover thumbnails
- ✨ New: Video + canvas based cover extraction
- ✨ New: Cache mechanism + viewport-priority loading
- 🔧 Optimized: CORS cross-origin compatibility

### Earlier Versions
- Image/video/audio/m3u8 basic sniffing
- Batch download with progress visualization
- AES-128 decryption support
- Multi-language translation
- Cookie/Storage management

---

## 🤝 Supported Platforms

- Bilibili (bilibili.com / b23.tv)
- Douyin (douyin.com)
- Kuaishou (kuaishou.com)
- And all other webpages containing images/videos

---

## ⚠️ Disclaimer

1. This script is for learning and research purposes only. Do not use for commercial purposes.
2. Please respect copyright. Do not distribute downloaded resources.
3. Users assume all consequences of using this script.
4. Please contact for removal if there are legal issues.

---

## 📄 License

[The Unlicense](LICENSE) - Public domain, free to use
