# 歌词显示控制面板改造计划

## 目标
为每个语种工作空间（普通话/English/粤语）创建独立的歌词显示控制面板，替代当前通用的 `displayConfig`/`displayOrder` 机制。

## 当前架构分析

### 现有控制面板（绿框区域）
- 位于 `MusicPlayer.jsx:171-189`
- 通用按钮组：每个启用的语言一个可拖拽按钮
- 按钮切换语言可见性 + 拖拽调整显示顺序

### 现有状态管理（App.jsx）
- `displayConfig`: `{ zh: true, en: false, yue: false }` — 控制哪些语言可见
- `displayOrder`: `['zh', 'en', 'yue']` — 控制歌词行的显示顺序
- `workspacesRef`: 存储每个工作空间的独立状态快照

## 改造方案

### 1. 安装依赖
```bash
npm install pinyin-pro
```
用于生成普通话拼音（替代 to-jyutping 的粤拼）

### 2. 新增拼音生成函数
**文件**: `src/utils/phoneticDict.js`
- 新增 `generatePinyinLyrics(zhLyrics)` 函数
- 使用 `pinyin-pro` 的 `pinyin()` 函数，`toneType: 'symbol'` 带声调
- 返回格式与 `generateJyutpingLyrics` 一致: `[{ time, text }]`

### 3. 修改状态管理
**文件**: `src/App.jsx`

替换 `displayConfig` + `displayOrder`，改为每工作空间独立设置：

```javascript
// 普通话工作空间设置
zhSettings: {
  showPinyin: false,        // 是否显示拼音
  lyricsOrder: ['zh', 'pinyin'],  // 歌词行显示顺序
}

// English 工作空间设置
enSettings: {
  showChinese: true,        // 是否显示中文歌词
  showEnglish: true,        // 是否显示英文歌词
  lyricsOrder: ['en', 'zh'],  // 歌词行显示顺序（可拖拽调整）
}

// 粤语工作空间设置
yueSettings: {
  showJyutping: true,       // 是否显示粤拼
  lyricsOrder: ['yue', 'zh'],  // 歌词行显示顺序（可拖拽调整）
}
```

新增状态变量和回调函数：
- `zhSettings` / `setZhSettings`
- `enSettings` / `setEnSettings`
- `yueSettings` / `setYueSettings`
- `handleToggleZhSetting(key)` — 切换普通话设置
- `handleToggleEnSetting(key)` — 切换 English 设置
- `handleToggleYueSetting(key)` — 切换粤语设置
- `handleReorderLyrics(lang, from, to)` — 拖拽调整歌词行顺序

更新 `workspacesRef` 以存储新的设置格式。

**兼容性处理**：保留 `displayConfig` 和 `displayOrder` 的计算逻辑，从新的 workspace 设置派生，传递给 `LyricsDisplay`。

### 4. 修改控制面板 UI
**文件**: `src/components/MusicPlayer.jsx`

替换当前通用按钮组（lines 171-189），根据 `activeLang` 渲染不同的控制面板：

#### 普通话面板
```
[ 显示拼音 ]  — 开关按钮，切换 showPinyin
```

#### English 面板
```
[ 中文歌词 ] [ 英文歌词 ]  — 两个开关按钮，各自独立切换
⣿ 中文歌词  ⣿ 英文歌词  — 可拖拽排序，调整歌词行的上下位置
```

#### 粤语面板
```
[ 显示粤拼 ]  — 开关按钮，切换 showJyutping
⣿ 粤拼歌词  ⣿ 中文歌词  — 可拖拽排序，调整歌词行的上下位置（原歌词始终显示）
```

新增 props 接收：
- `zhSettings`, `onToggleZhSetting`
- `enSettings`, `onToggleEnSetting`, `onReorderEnLyrics`
- `yueSettings`, `onToggleYueSetting`, `onReorderYueLyrics`
- `activeLang`

### 5. 修改歌词显示逻辑
**文件**: `src/components/LyricsDisplay.jsx`

根据 `activeLang` 和对应的工作空间设置，决定渲染逻辑：

#### 普通话模式
- 始终显示中文歌词
- 若 `showPinyin=true`，在中文歌词上方/下方添加拼音行
- 拼音行使用 `generatePinyinLyrics()` 生成

#### English 模式
- 根据 `lyricsOrder` 决定中文/英文歌词的上下顺序
- `showChinese`/`showEnglish` 控制各语言是否显示
- 支持仅显示一种语言

#### 粤语模式
- 始终显示中文原歌词
- 若 `showJyutping=true`，添加粤拼行
- 根据 `lyricsOrder` 决定粤拼/中文的上下顺序

新增 props：
- `zhSettings`, `enSettings`, `yueSettings`
- `pinyinLyrics`（由 App.jsx 生成并传递）

### 6. 样式调整
**文件**: `src/components/MusicPlayer.css`
- 新增 `.zh-controls`, `.en-controls`, `.yue-controls` 样式
- 新增 `.toggle-btn` 样式（开关按钮）

**文件**: `src/components/LyricsDisplay.css`
- 新增 `.pinyin-line` 样式（类似 `.jyutping-line`）

## 修改文件清单

| 文件 | 改动类型 |
|------|----------|
| `package.json` | 添加 `pinyin-pro` 依赖 |
| `src/utils/phoneticDict.js` | 新增 `generatePinyinLyrics` 函数 |
| `src/App.jsx` | 重构状态管理，新增 workspace 设置 |
| `src/components/MusicPlayer.jsx` | 替换通用按钮组为语言特定控制面板 |
| `src/components/MusicPlayer.css` | 新增控制面板样式 |
| `src/components/LyricsDisplay.jsx` | 根据新设置调整渲染逻辑 |
| `src/components/LyricsDisplay.css` | 新增拼音行样式 |

## 验证方式
1. `npm run dev` 启动开发服务器
2. 分别切换到普通话/English/粤语工作空间
3. 验证各控制面板功能：
   - 普通话：拼音开关正常
   - English：中/英文切换 + 拖拽排序正常
   - 粤语：粤拼开关 + 拖拽排序正常，原歌词始终显示
4. 验证工作空间切换时设置正确保存/恢复
5. `npm run build` 确认构建无错误
