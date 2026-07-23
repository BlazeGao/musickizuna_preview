# MusicKizuna 项目优化与改进建议

> 审查日期：2026-07-23
> 审查范围：`src/` 全部源码、`vite.config.js`、`package.json`、`PLAN.md`
> 基线：commit/状态为当前工作树

## 一、发现的错误逻辑 / 实现（请优先确认后再改）

以下问题不直接修改，先列出供讨论确认。

### 1. [BUG] 拼音分支缺失 TTS 按钮
- **位置**：`src/components/LyricsDisplay.jsx:255-293`（`hasPinyin && pinyinLyrics` 分支）
- **现象**：其它 6 个分支（yue 多语、en 双语、ja、单语、fallback 等）都通过 `renderTTSButtons(index, line.text)` 渲染「朗读/慢速朗读」按钮；唯独「显示拼音」分支没有调用。
- **影响**：普通话工作空间开启「显示拼音」后，悬停任意行看不到朗读按钮，与其它语言行为不一致。该分支 JSX 结构本身是闭合的，但缺少 TTS 调用。

### 2. [BUG] `loadEntry` 在 zh 工作空间下设置无意义的 `parsedMap.pinyin = null`
- **位置**：`src/App.jsx:374-378`
  ```js
  } else if (lang === 'zh' && parsedMap.zh) {
    parsedMap.pinyin = null
  }
  ```
- **问题**：将 `null` 写进 `lyricsMap`，污染 map；`activeLyrics` 计算时无害，但 `saveHistory` / `currentLyricsName` 等会遍历到 `pinyin` 键，且每次切换都会重新复制该键。
- **建议**：删除该分支，或显式 `delete parsedMap.pinyin`；拼音不应进入 `lyricsMap`，应由 `pinyinLyrics` 单独管理（参考 App.jsx:308-313 的派生方式）。

### 3. [BUG] `handleToggleYueSetting` 未对称处理「中文」语种的过滤
- **位置**：`src/App.jsx:217-231`
- **问题**：相对 `handleToggleEnSetting` / `handleToggleJaSetting`，yue 的回调仅处理 `showJyutping`，且只增删 `'yue'`。`yue` 工作空间下 zh 始终存在，但若将来允许其它语种加入，缺少对称处理易引入回归。
- **副作用**：`lyricsOrder` 可能残留过期键（例如初始化为 `['yue','zh']`，后续若手动变更设置之外的语种未做同步）。当前可读但脆弱。
- **建议**：与 en/ja 一致，统一过滤逻辑并保证 `lyricsOrder` 跟随可见集合。

### 4. [BUG] `saveHistory` 跳过存储 yue 歌词但保留派生映射条件不对
- **位置**：`src/App.jsx:319`
  ```js
  if (activeLang === 'yue' && lang === 'yue') continue
  ```
- **问题**：粤语工作空间下 `lyricsMap` 也可能通过 `handleLyricsSelect` 把用户上传的 `zh` 歌词存进去；`yue` 是从 `zh` 派生的，跳过存储是对的。但条件 `activeLang === 'yue' && lang === 'yue'` 还应同时跳过 `pinyin`、`furigana`、`romaji` 等所有派生键。当前 `ja` 已显式过滤 `furigana` / `romaji`（line 320），但若以后扩展 `pinyin` 在 `yue` 命名空间下使用就会被写入历史存储。
- **建议**：用「派生集合」白名单过滤，例如 `const DERIVED = new Set(['yue','pinyin','furigana','romaji'])` 统一跳过。

### 5. [BUG] `MusicPlayer` 切换音乐文件时旧 audio 元素未释放资源
- **位置**：`src/components/MusicPlayer.jsx:84-91`
  ```js
  useEffect(() => {
    if (audio && musicFile) { audio.load(); ... }
  }, [musicFile])
  ```
- **问题**：`audio.src` 由 JSX 与 `ref` 自动接管，但 `URL.createObjectURL` 创建的 blob URL `App.jsx` 端在切换文件时会 revoke（`handleMusicSelect`），而组件挂载时由 React 自动设置的 `src` 在 `musicFile=null`→`objectURL` 跳变时没有显式 `audio.removeAttribute('src')`。`load()` 可重复，但未触发组件卸载清理。
- **更明显的遗漏**：`App.jsx` 组件卸载时没有 `URL.revokeObjectURL(audioUrlRef.current)` 清理。
- **建议**：在 `App.jsx` 添加一个 `useEffect(() => () => { if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current) }, [])`；并在 `MusicPlayer` 卸载时移除监听并调用 `audio.pause()`。

### 6. [BUG] 自动播放监听器可能泄漏
- **位置**：`src/components/MusicPlayer.jsx:93-112`
- **问题**：`audio.addEventListener('canplay', onCanPlay)` 在 closure 内部删除，但若 `musicFile` 在 `canplay` 触发前再次变化，旧 `onCanPlay` 不会被移除（新 effect 不会清掉旧 effect 注册的监听）。
- **建议**：在 effect 返回中 `audio.removeEventListener('canplay', onCanPlay)`。

### 7. [潜在 BUG] `findCurrentLyricIndex` 在 `currentTime` 略小于首句时返回 0
- **位置**：`src/utils/lrcParser.js:33-39`
- **问题**：循环若没找到 `currentTime >= lyrics[i].time`，落到 `return 0`，意味着播放进度在第一句开始之前，`currentIndex` 已为 0，UI 上首句被高亮。
- **影响**：歌曲前奏期首句提前高亮。多数 LRC 行为可接受，但与「未到时间」语义不完全正确。
- **建议**：返回 `-1` 并允许 UI 显示「未开始」；或在调用处用 `lyrics[0].time` 与 `currentTime` 比较来达到首句高亮时机。请确认产品期望。

### 8. [潜在 BUG] `activeLangRef` 与 `activeLyrics` 在 `handleTimeUpdate` 闭包中可能错位
- **位置**：`src/App.jsx:441-462`，依赖 `[activeLyrics]`
- **问题**：当用户在 `singleRepeat` 模式下切换语言（`handleSwitchLang` 会早于 `activeLyrics` 重算完成），`activeLyrics` 会被缓存为新语言的歌词；`repeatTargetRef.current` 仍指向上首语言索引，可能出现越界 → `activeLyrics[repeatTargetRef.current]` 读到 `undefined`，再 `.time` 抛错。
- **建议**：`handleSwitchLang` 已经把 `repeatTargetRef.current = -1`，但与 `handleTimeUpdate` callback 竞态条件下仍可能在中途触发；建议 `seekTo` 前加 `activeLyrics[target]` 存在性判定。

### 9. [潜在 BUG] 韩语 (ko) 在_LABELS 中存在但 `SUPPORTED_LANGS` 未列入
- **位置**：`src/utils/historyManager.js:1`
  ```js
  export const LANG_LABELS = { zh: '普通话', en: 'English', yue: '粤语', ja: '日本語', ko: '한국어' }
  export const SUPPORTED_LANGS = ['zh', 'en', 'yue', 'ja']
  ```
- **影响**：界面不显示韩语按钮，但 `migrateOldHistory` 与迁移路径未处理 `ko`，等若韩语数据嵌在旧 `musickizuna_history` 中会被丢弃。
- **建议**：明确「是否上线韩语」——上线则补完工作空间、设置面板、SoTTS 通路；否则移除 `LANG_LABELS.ko` 以免后续误用。

### 10. [安全] `dangerouslySetInnerHTML` 渲染 kuroshiro 输出未做转义
- **位置**：`src/components/LyricsDisplay.jsx:332`
  ```jsx
  <span dangerouslySetInnerHTML={{ __html: furiganaLyrics[index].text }} />
  ```
- **问题**：歌词来自用户上传 LRC 文件，若包含 `<script>`/`<img onerror>` 等 HTML，将直接执行。
- **建议**：上传解析时先 HTML 转义（`text.replace(/[&<>"]/g, ...)`），再交给 kuroshiro；或对 kuroshiro 输出做白名单过滤（仅保留 `<ruby><rt>` 标签）。

## 二、架构 / 可维护性改进建议

### A. 状态管理
1. **`displayConfig + displayOrder` 与各语言 settings 并行存在**（App.jsx:64-86），实际只用 `displayOrder` 即可派生可见性后过滤即可。当前两套数据耦合且产生一致性约束（如 `handleToggleEnSetting` 必须同步维护 `lyricsOrder`）。建议合并为单一 `enabledLangs` 数组（顺序即优先级），各设置面板只操作这一数组。
2. **`workspacesRef.current[activeLang]` 的保存与 settings 双向同步**易出 bug（参考 `handleSwitchLang`）。建议引入 `useReducer` 集中管理 4 个工作空间的状态与切换；可极大降低 `useCallback` 依赖复杂度（部分 callback 依赖 7-9 个 state）。
3. **派生数据放在 `useMemo` 中**：`pinyinLyrics`、`furiganaLyrics`、`romajiLyrics`、`enabledLangs`、`activeLyrics`、`displayConfig`、`displayOrder`、`currentLyricsName`、`currentEntry` 都是纯派生值，目前每次渲染都重新计算（部分还触发异步 fetch）。改用 `useMemo` 可避免无意义重渲。

### B. 模块复用
4. **`cantoneseTTS.js` 和 `japaneseTTS.js` 几乎完全重复**（openDB / getCachedBlob / setCachedBlob / fetchTTSFromServer / readLyric / stopCurrentAudio）。区别仅 `DB_NAME` 与 `lang` 参数。建议合并为 `ttsService.js`，传 `lang: 'yue'|'ja'` 参数；并复用 `audioCache.js` 的 IndexedDB 封装（二者文件结构完全相同）。同样建议把 `audioCache.js` 的 `openDB` 同样抽象为 `idb.js` 工具。
5. **`API_BASE = 'http://127.0.0.1:5001'`** 在 3 个文件中硬编码。建议放入 `src/config.js` 或使用 `import.meta.env.VITE_API_BASE`。
6. **MusicPlayer 三个 `renderXxxControls`** 高度重复（labels / 拖拽排序）。建议抽出 `<ReorderGroup items=... onReorder=... labels=... />` 通用组件，三个语言面板只剩 toggle 区块。

### C. 性能
7. **`renderLineText` 每次 render 都重新 tokenize 并创建节点**。可对每个唯一文本 `useMemo` 缓存。当前重渲频繁（`currentTime` / `currentIndex` 变化每次都 rerender 整个列表）。
8. **`audio.addEventListener('timeupdate')`** 在 `MusicPlayer` 中每次 `musicFile`/`onTimeUpdate` 变化都会重绑。React 通常稳定 `onTimeUpdate` 引用（已 `useCallback`），但 `onTimeUpdate` 在 App 中依赖 `activeLyrics`，切换语言会重绑监听。可接受，但建议改成 `requestAnimationFrame` 节流，避免高频 `setState(currentTime)` 引起 React 调度开销。
9. **localStorage 缓存无 TTL/容量上限**（`phonetic_cache`）。长时间使用可能突破 `quotaExceeded`。建议改为 `Map` + LRU 或迁移到 IndexedDB。
10. **IndexedDB 音频缓存无清理**（`musickizuna_audio` / `musickizuna_tts` / `musickizuna_ja_tts`）。3 个独立数据库、各自一个 store，需要用户提供「清除历史」按钮统一清理。

### D. 可测试性
11. **没有测试**：`package.json` 无 `test` 脚本、无 lint、无 typecheck。建议至少配置 ESLint + 一份 Vitest 用例覆盖 `lrcParser`、`phoneticDict.generatePinyinLyrics`、`historyManager` 状态机。
12. **`PLAN.md` 没有指明日语 / 韩语面板的最终实现路径**：实际代码已扩展 `jaSettings`，但 PLAN 中只有 zh/en/yue 三种。文档与实现严重脱节，建议同步更新或拆为 `docs/plan-phase1.md`、`docs/plan-phase2-japanese.md`。

### E. 可访问性 / 健壮性
13. **拖拽排序无键盘替代方案**。`MusicPlayer.jsx` 与 `Sidebar.jsx` 均依赖 HTML5 DnD，键盘用户无法排序。可叠加 `onKeyDown` 上下方向调整。
14. **`FloatingActionMenu` 拖动状态未持久化**。刷新后位置丢失，可使用 `localStorage` 存 `bottom/right`。
15. **服务器宕机无降级 UI**：所有 TTS / 拼音重查询失败静默忽略（`catch {}`）。建议在 `LyricsDisplay` 给出 toast/提示，避免用户困惑「为什么没朗读」。
16. **`accept=".txt,.lrc"` 未列 `.lrc3` / ID3v2 等格式**，且未做后续格式校验。
17. **`<input type="file">` 在每次 addLyrics 后 `e.target.value = ''`** — 通常正确，但有时同一文件用户想再次同名上传会被截断（罕见，可不处理）。

### F. 构建 / 工程
18. **`vite.config.js` 的 `optimizeDeps.include: ['kuromoji', ...]`** 中 `'kuromoji'` 未被直接 import，实际只导入 `kuroshiro-analyzer-kuromoji`。多余条目易让追踪误判依赖；可移除 `kuromoji`。
19. **`scripts` 没有 `lint`/`typecheck`/`test` 净化命令**。AGENTS.md 可建议补一条 `"lint": "eslint src"`，详见运行指南。
20. **`dev.bat` 未审查**：如果它启动后端服务，请确保端点与 `API_BASE` 一致；环境差异（生产 vs 开发）无显式控制。
21. **`dist/` 已存在** 建议加入 `.gitignore`（若尚未）；`node_modules` 已忽略但 `dist` 可能未忽略（未检查 .gitignore）。

## 三、文档 / 协作建议

22. **`PLAN.md` 已与实际偏离**：当前支持 4 种语言、有 furigana/romaji，PLAN 只覆盖 3 种。建议重写或拆分。
23. **缺少 README**：仓库根目录无 `README.md`，外部贡献者不知如何启动（`dev.bat` 隐式职责）。建议记录后端 API 契约（`/api/tts`、`/api/phonetic`）、环境变量、Kuromoji 字典放在 `public/kuromoji-dict/` 的部署说明。
24. **建议补 `AGENTS.md`**：列出 `npm run dev` / `npm run build` / `npm run lint` 等约定命令，便于工具型 agent 直接执行。

## 四、优先级建议

| 优先级 | 项目 | 类型 |
|------|------|------|
| P0 | #1 拼音模式缺 TTS | bug |
| P0 | #10 XSS 风险 | 安全 |
| P0 | #2 null pinyin 污染 | bug |
| P1 | #5/#6 资源清理 | bug/泄漏 |
| P1 | #8 单句循环跨语言越界 | bug |
| P1 | #4 saveHistory 派生键过滤 | bug |
| P1 | #9 韩语数据半残 | 一致性 |
| P2 | A1/A2/A3 状态管理重构 | 架构 |
| P2 | B4/B5/B6 模块复用 | 架构 |
| P2 | C7/C8 性能优化 | 性能 |
| P3 | D11 测试 / E13-E17 a11y | 工程 |
| P3 | F18-F21 构建清理 | 工程 |

---

> 以上建议均未在本会话动手修改。请确认优先级与方案后告知，再分步实施。