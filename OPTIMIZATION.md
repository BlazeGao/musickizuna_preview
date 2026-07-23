# MusicKizuna 代码审查与优化建议

> 审查范围：`src/`、`server/app.py`、配置文件、构建脚本
> 审查方式：静态阅读，**未修改任何代码**
> 本文档先列出发现的**错误/可疑逻辑**（B 类），再给出**优化改进建议**（A 类）。

---

## 一、错误 / 可疑逻辑（请优先确认后再决定是否修改）

以下条目按严重程度排序，从高到低。

### B1. `dev.bat` 启动脚本身指向错误目录（高，功能性 bug）

`dev.bat:3` 中执行：

```bat
cd /d "%TEMP%\opencode\pkg_tmp"
node node_modules\vite\bin\vite.js --host
```

`%TEMP%\opencode\pkg_tmp` 是打包/解压的临时目录，**并非项目根目录**。直接双击 `dev.bat` 会因找不到 `node_modules/vite` 而失败。应当使用基于脚本自身路径的相对定位，例如：

```bat
cd /d "%~dp0"
node node_modules\vite\bin\vite.js --host
```

请确认是否是上次打包流程残留后误提交，建议改为相对项目目录或直接 `npm run dev`。

---

### B2. 工作空间快照与跨语种 `lyricsMap` 注入逻辑混乱（高，逻辑 bug）

`src/App.jsx:handleSwitchLang`（约 147-183 行）实现有几个不一致点：

1. 第 151-157 行先把当前语种的 settings 与基础字段写入快照，**没有写入当前 `lyricsMap`**（基础字段里没列 `lyricsMap`），随后在第 168-170 行从快照读取时 `setLyricsMap(snap.lyricsMap)` 读到的可能是**很久之前**或初始化的旧 `lyricsMap`，而不是切换前的最新值。
   - 这意味着切换语种会丢失刚刚加载但未保存到 history 的歌词内容。
   - 验证场景：在 zh 工作空间加载歌词（未点保存/无 history）→ 切换到 en → 再切回 zh，歌词应消失还是保留？当前实现是保留**最初的快照**，而非最新加载的内容。

2. 第 159-165 行的跨语种注入逻辑（`yue`/`ja` 共用 zh 歌词）在“切换到”分支里直接 `workspacesRef.current.yue.lyricsMap = { ...snap, zh: lyricsMap.zh }`，**就地突变 ref 内对象**，与上方“先整对象替换再读取”的范式不一致；同时它读取的是切换发生时**当前工作空间**的 `lyricsMap.zh`——如果当前是 `en`，`lyricsMap.zh` 可能来自更早的 zh 工作空间，数据流向不可控。

3. `ja` 分支注入条件 `!workspacesRef.current.ja.lyricsMap.ja && lyricsMap.ja?.length > 0`：从 `en`/`zh` 切向 `ja` 时，`lyricsMap.ja` 大概率不存在，导致该“共享 ja 歌词”的分支实际上几乎永远不执行。`\`

建议：明确每个工作空间应共享哪些语种数据，统一快照写入格式（包含 `lyricsMap`），并去掉就地突变写法。

---

### B3. `pinyinLyrics` 每次渲染重新生成且未 memo（中，性能 + 潜在稳定 bug）

`App.jsx:308-313`：

```js
const pinyinLyrics = (() => {
  if (activeLang === 'zh' && zhSettings.showPinyin && lyricsMap.zh?.length > 0) {
    return generatePinyinLyrics(lyricsMap.zh)
  }
  return null
})()
```

- `generatePinyinLyrics` 同步 `map` 整个 zh 歌词数组，**每次渲染（包括纯状态更新如 `currentTime`）都重新构造新数组**，传给 `LyricsDisplay` 会破坏其 memo 比较并触发重渲染。
- `pinyin-pro` 的 `pinyin()` 对每行调用一次，体量较大时性能损耗明显。
- 建议改为 `useMemo([activeLang, zhSettings.showPinyin, lyricsMap.zh])`。

---

### B4. `handleTimeUpdate` 与 `MusicPlayer` 监听 effect 形成订阅抖动（中，性能 bug）

链路：

- `App.jsx:handleTimeUpdate` 依赖 `[activeLyrics]`，而 `activeLyrics` 是每次 render 都重新计算的 IIFE 结果（数组引用每次都新）。
- → `handleTimeUpdate` 每次 render 重新创建。
- → `MusicPlayer.jsx:useEffect([musicFile, onTimeUpdate])` 中 `addEventListener/removeEventListener` 每次都重新执行。
- audio 的 `timeupdate` 高频触发 → 导致 effect 反复解绑/绑回，存在丢帧与逻辑竞态风险。

建议：用 `useRef` 包裹 `handleTimeUpdate`，或在 `MusicPlayer` 内部 effect 仅依赖 `musicFile`，listener 通过 ref 调用最新回调。

---

### B5. `singleRepeat` 的 `seekTo` 反馈循环（中，潜在死循环 bug）

`handleTimeUpdate`（`App.jsx:441`）：

```js
if (idx !== repeatTargetRef.current) {
  setCurrentIndex(repeatTargetRef.current)
  playerRef.current?.seekTo(activeLyrics[repeatTargetRef.current].time)
  return
}
```

- `seekTo` 改变 `audio.currentTime` → 触发 `timeupdate` 事件 → 再次进入此回调。
- 虽然第二次进入时 `idx === repeatTargetRef.current`（已在目标行），理论上不会无限循环；但若 `findCurrentLyricIndex` 因浮点/边界判断返回非预期索引（特别是目标行时间落在多行同时间戳处），仍可能产生抖动。
- 同时 `seekTo` 设置 `setCurrentTime` 又通过 React 状态回流，使进度条抖动。

建议：在 seek 内加状态锁，或允许 `idx` 在一个小阈值内视为命中。`App.jsx:seekLockRef` 已声明但**未被使用**（`src/App.jsx:48`），疑似未完成的重入保护。

---

### B6. `seekTo` 与 `audio.currentTime` 赋值缺少 readyState 守卫（中，bug）

`MusicPlayer.jsx:useImperativeHandle.seekTo`：

```js
seekTo(time) {
  const audio = audioRef.current
  if (!audio) return
  audio.currentTime = time
  setCurrentTime(time)
}
```

- 若 audio 尚未 `HAVE_METADATA`（`readyState < 1`），赋值 `currentTime` 会抛 `InvalidStateError` 或静默失败，导致进度条/歌词脱节。
- 验证场景：刚加载 entry 立即点击歌词行。

建议：`if (audio.readyState >= 1) audio.currentTime = time; else audio.addEventListener('loadedmetadata', ..., { once: true })`。

---

### B7. `saveHistory` 保留的是“旧文本”而非实际加载文本（低-中，逻辑存疑）

`App.jsx:315`：

```js
lyrics[lang] = {
  name: entry?.lyrics?.[lang]?.name || '',
  text: parsed.length > 0 ? (entry?.lyrics?.[lang]?.text || '') : '',
}
```

- `parsed` 已是解析后的对象数组，但写入 history 的 `text` 仍然取自 `entry?.lyrics?.[lang]?.text`（旧文本），而非实际 `parsed` 对应的 LRC 原文。
- 后果：如果加载阶段对 `lyricsMap` 做过改动（如 yue 分支重新生成 jyutping），不会反映到 history，但保留旧文本也能工作；由此导致 `loadEntry` 永远从旧文本重新 parse ——**逻辑上自洽但不直观**，疑似意图是“仅更新元信息/顺序而不修改文本”。
- 不算 bug，但建议显式注释意图，或直接保存真实文本以免后续重构时踩坑。

---

### B8. yue/ja 工作空间下 `lyricsMap.yue` 被自动生成却仍可能参与 history 保存条件（低）

`saveHistory:319-326` 仅显式跳过了 `activeLang === 'yue'` 的 `yue` 与 `activeLang === 'ja'` 的 `furigana`/`romaji`。但若用户曾在 yue 工作空间生成过 `yue`，后切换到 `ja`/`en` 时 `workspacesRef` 不清理，理论上 `lyricsMap` 不应跨工作空间存在 `yue` 项——但如果 `handleSwitchLang` 数据流按 B2 修复后变化，此处 skip 列表需要同步审视。建议把“不应保存的派生项”集中通过显式常量管理，避免遗漏。

---

### B9. `loadEntry` 中 `parsedMap.pinyin = null` 是无意义的死分支（低，dead code）

`App.jsx:376-378`：

```js
} else if (lang === 'zh' && parsedMap.zh) {
  parsedMap.pinyin = null
}
```

- `lyricsMap.pinyin` 在任何渲染逻辑中**都不会作为歌词来源**（`LyricsDisplay` 走 `pinyinLyrics` props，并且 `activeLyrics` 中遇到 `'pinyin'` 直接 `continue`）。
- 此赋值不会破坏什么，但属于无效代码，建议移除以免误导。

---

### B10. `findCurrentLyricIndex` 边界返回 0 的副作用（低，可疑）

`lrcParser.js:33`：当 `currentTime < lyrics[0].time` 也返回 `0`，导致首句在“时间未到”时已被高亮。功能上可接受，但与 `onSeek` 中 `index !== currentIndex` 的判断耦合时，会使用户**无法在播放前点击第一个 ▶ seek 按钮**（因为 `currentIndex === 0` 时按钮不渲染）。建议对“未开始播放”使用 `-1`，或在 UI 上允许首句的 seek 按钮。

---

### B11. `migrateOldHistory` 中 `byLang` 不含 `ja`（低，迁移不全）

`historyManager.js:16`：

```js
const byLang = { zh: [], en: [], yue: [] }
```

- 老 history 中的 `ja` 歌词条目会被驱动 `byLang[lang]` 失败（`undefined`），虽然后面有 `if (byLang[lang])` 保护，结果是这些条目**被静默丢弃**，最终 fallback 到 `byLang.zh`。如果有用户曾用老版本存过 ja 歌词，迁移后丢失。低概率但应记录。

---

### B12. CORS 配置过宽（低，安全配置）

`server/app.py:16`：`CORS(app)` 默认允许任意 Origin。虽然服务器绑定 `127.0.0.1`，但 TTS 接口会消耗 `QWEN_TTS_API_KEY` 配额。建议显式 `CORS(app, origins=['http://localhost:5173', 'http://127.0.0.1:5173'])`。

---

### B13. `phonetic_batch` 已实现但前端未使用（低）

`app.py` 有 `/api/phonetic/batch`，但 `phoneticDict.js` 仅用单条 `/api/phonetic`。批量加载某行所有单词的 IPA 能减少请求数。建议或对接，或移除以减少维护负担。

---

## 二、优化改进建议（A 类）

### A1. 状态管理重构：抽离工作空间 settings 为通用 shape

当前 `zhSettings/enSettings/yueSettings/jaSettings` 各有自己的字段，且对应的 `handleToggle*Setting` / `handleReorder*` 几乎是复制粘贴。建议：

- 用一个 `WORKSPACE_SETTINGS` 描述表定义每个语种的字段；
- 用通用 `useWorkspaceSettings(lang)` hook 替代四份独立 state；
- 可显著降低 `App.jsx` 的复杂度（目前 604 行）并避免后续新增语种时重复样板代码。

### A2. 用 `useMemo` 重算派生值

`displayConfig`、`displayOrder`、`enabledLangs`、`activeLyrics`、`pinyinLyrics`、`currentLyricsName` 均为 render 内的 IIFE。建议使用 `useMemo`，依赖项明确列出，避免每次 render 都重新计算与生成新引用，破坏子组件 memo。

### A3. 抽离 `LyricsDisplay` 内重复渲染分支

`LyricsDisplay.jsx`（448 行）中存在 4 套几乎相同的 `map` 子树结构（单语、双语、jyutping、pinyin、ja）。建议：

- 提取 `<LyricLine>`、`<LyricLineGroup>` 组件；
- 顶层只决定“哪些 sub-line 在哪一顺序显示”，交给子组件渲染；
- 当前结构既长又不易加新语种，重构后 bug 面更小。

### A4. 抽离 TTS 工具

`cantoneseTTS.js` 与 `japaneseTTS.js` 几乎逐行重复，仅 `cacheKey` 前缀与默认 `lang` 不同。建议合并为 `ttsPlayer.js`，导出 `createTTS({ lang, prefix, db name })` 或用单例 + 配置参数。同时可统一管理 `currentAudio`，避免粤语/日语 TTS 实例并存时互相不停不掉。

### A5. 用 `useRef` 收敛高频回调

`handleTimeUpdate`、`handleSeekFromBar`、`handlePauseMusic`、`handleResumeMusic` 等 `MusicPlayer` 需要稳定回调，建议改为 `useRef` 包裹的最新函数，或父组件用 `useEvent` 模式，避免高频 effect 重订阅。

### A6. `audioCache` 增加容量与过期清理

`audioCache.js` 没有容量上限、没有过期清理，音频 Blob 长期累积会让 IndexedDB 膨胀。建议：

- 维护元数据（名称、大小、最后访问时间）；
- 写入时检查总大小，超过阈值（如 200MB）按 LRU 淘汰。

### A7. `MusicPlayer` 拆分播放器与控制面板

`MusicPlayer.jsx` 当前同时负责 audio 元素控制 + 4 套语种控制面板 + 拖拽排序。建议拆为：

- `<AudioController>`（audio + 进度 + 音量）；
- `<WorkspaceControls>`（根据 activeLang 渲染对应面板，并接 `useWorkspaceSettings`）。

### A8. 服务端 `cache` 持久化

`app.py` 的内存 `cache = {}` 进程重启即丢。可落盘到 `tts_cache/` 旁的 `phonetic_cache.json`，或继续依赖前端 localStorage 即可。需要明确“谁为缓存负责”。

### A9. `vite.config.js` 依赖路径风险

`optimizeDeps.include: ['kuromoji', 'kuroshiro', 'kuroshiro-analyzer-kuromoji']`，但 `package.json` 中 `kuromoji` 并不是直接依赖。Vite 预构建找不到包时会报错。建议：

- 确认 `kuromoji` 是否通过 `kuroshiro-analyzer-kuromoji` 传递依赖（是）；
- 显式列出 `kuromoji` 或移除以依赖自动发现。

`resolve.alias.path = 'path-browserify'` 只为兼容某库对 Node `path` 的引用；建议加注释说明来源，便于后续清理。

### A10. 渲染层 `key` 使用数组下标

`LyricsDisplay` 与 `Sidebar` 多处使用 `key={index}`。当列表通过 `lyricsMap` 变更或历史被重排时，React 会复用错误 DOM 节点，导致动画/状态错位。建议为歌词行引入稳定 id（基于 `time` 或 `time+text`），为历史项用 `entry.id`（已经做了）。

### A11. `app.py` 返回 TTS 时支持 Range 请求

`send_file` 默认不开启 `conditional=True`，浏览器/audio 标签对长音频 `Range` 请求无法 seek。建议使用 `send_file(path, conditional=True)`，或者直接返回 `audio_url` 让前端 `<audio>` 直接拉取 OSS 链接（减少一次服务器中转）。

### A12. `fetchPhonetic` 默认大小写处理

`fetchPhonetic` 用 `key = word.toLowerCase()` 作 cache 键，返回一致的 ipa；但调用方 `handleWordDoubleClick` 在选区里区分原始大小写展示，cache key 大小写归一化没问题。考虑加个简单的内存 LRU 限制（避免 localStorage 爆掉）。

### A13. `FloatingActionMenu` 拖拽与 click 判定依赖 `pos` 闭包

`handlePointerDown` 依赖 `[pos]`，每次 `pos` 变化都会重建回调。建议改用 ref 持有最新 `pos`，让 `handlePointerDown` 稳定，提高拖拽体验一致性。

### A14. 建议接入 `phonetic_batch` 或在前端做单歌词行内单词去重

用户 hover 一行英文歌词时该行所有单词逐个触发 `fetchPhonetic`，相同单词也会重复请求（虽然 cache 命中）。可在用户双击某词后才请求，目前实现已是双击触发，OK——只是批量接口空闲。考虑删除或对接。

### A15. 文档与命令统一

`PLAN.md` 是阶段性改造记录，已经实现完毕（多语 settings 上线）。建议在改造完成后更新或归档到 `docs/`，避免后续阅读者误以为仍在计划中。`package.json` 的 scripts 仅留 `dev/build/preview`，建议补充 `lint`、`format`（如 Prettier/ESLint）以便保持代码风格。

### A16. 引入 ESLint / Prettier 与 TypeScript 渐进迁移

当前为纯 JSX 无类型约束。鉴于 `@types/react` 已在 devDependencies，最小成本可先加入 `eslint-plugin-react-hooks`，自动捕捉 `useEffect` 依赖缺失（例如 B4 的问题就能被规则发现）。

---

## 三、建议处理顺序

1. **先确认 B1（dev.bat）**——影响所有协作者的启动入口。
2. **梳理 B2 / B3 / B4 / B5 / B6**——均与工作空间/播放核心链路相关，建议在同一次重构中统一修复（同时落地 A1 / A2 / A5）。
3. **B11 / B12 / B13**——数据迁移与安全/接口收敛，可在一次小迭代集中处理。
4. **A3 / A4 / A7**——结构性重构，建议在状态管理理顺后再做，避免大改与 fix 冲突。
5. **A8-A16**——长期改进项。

---

## 四、未审查的部分

- `dist/`（构建产物）、`public/`、`音乐素材/`（资源）、`MusicPlayer.css` / `NowPlaying.css` / `Sidebar.css` / `FloatingActionMenu.css` / `App.css`（样式层未深入审查，仅 LyricsDisplay.css 已浏览）。
- `server/tts_cache/`（生成产物）。
- 没有运行任何测试或构建命令。

如需对其中任一条目展开验证或动手修复，请告知具体条目编号。