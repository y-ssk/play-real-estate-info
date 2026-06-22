# Tooltip

> 補足情報のホバー/フォーカス表示コンポーネント仕様。
> Tailwind CSS 4

---

## 1. 原則

- **補足情報**: ラベルやボタンの追加説明を、ホバーまたはフォーカスで表示する
- **非侵入的**: コンテンツの操作を妨げない。閲覧のみで、インタラクティブ要素は含めない
- **4方向対応**: top（デフォルト）, bottom, left, right に配置可能
- **キーボード対応**: フォーカスでも表示され、Escape で非表示にできる

---

## 2. 解剖

```
         ┌─────────────────┐
         │  テキスト内容     │
         └─────────────────┘
```

| パーツ | 役割 | 必須 |
|--------|------|------|
| Container | ツールチップ本体。背景色・角丸・シャドウを持つ | Yes |
| Text | 補足説明テキスト | Yes |

---

## 3. パターン

### 3-1. 方向

| 方向 | クラス | デフォルト |
|------|--------|:---------:|
| Top | `tooltip-top` | Yes |
| Bottom | `tooltip-bottom` | No |
| Left | `tooltip-left` | No |
| Right | `tooltip-right` | No |

### 3-2. サイズ制御

```css
[role="tooltip"] {
  width: max-content;    /* 内容に合わせて幅を決定 */
  max-width: 20rem;      /* 320px で折り返し */
}
```

- 短いテキスト → 1行で表示（改行しない）
- 長いテキスト → `max-width: 20rem` で自然に折り返し

---

## 4. 振る舞い

### Container

```
bg-slate-600 text-white text-sm rounded-lg shadow-sm px-3 py-2
```

| プロパティ | 値 |
|-----------|------|
| 背景色 | `bg-slate-600` |
| テキスト色 | `text-white` |
| フォントサイズ | `text-sm` (14px) |
| 角丸 | `rounded-lg` |
| シャドウ | `shadow-sm` |
| パディング | `px-3 py-2` |
| Z-index | `z-20` |
| サイズ | `width: max-content; max-width: 20rem` |

### アニメーション

```
transition-opacity duration-200
```

- 表示: `opacity-0` → `opacity-100`
- 非表示: `opacity-100` → `opacity-0 pointer-events-none`

---

## 5. アクセシビリティ

| 属性 | 値 |
|------|------|
| `role` | `"tooltip"` |
| `aria-describedby` | トリガー要素に設定（tooltip の id を参照） |
| 表示トリガー | hover + focus（キーボードa11y 対応） |
| Escape キー | 全ツールチップを非表示にする |
| アイコンボタン | `aria-label` 必須（テキストがないため） |

> 共通: prohibited.md「カラー」「アクセシビリティ」参照

---

## 6. Tailwind サンプル

### 基本（Top）

```html
<div class="relative inline-block">
  <button
    aria-describedby="tooltip-1"
    onmouseenter="showTooltip('tooltip-1')"
    onmouseleave="hideTooltip('tooltip-1')"
    onfocus="showTooltip('tooltip-1')"
    onblur="hideTooltip('tooltip-1')"
    class="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
    ボタン
  </button>
  <div id="tooltip-1" role="tooltip"
    class="tooltip-top absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-600 text-white text-sm rounded-lg shadow-sm px-3 py-2 z-20 opacity-0 pointer-events-none transition-opacity duration-200">
    ツールチップの内容
  </div>
</div>
```

### アイコンボタン

```html
<div class="relative inline-block">
  <button
    aria-label="設定"
    aria-describedby="tooltip-2"
    onmouseenter="showTooltip('tooltip-2')"
    onmouseleave="hideTooltip('tooltip-2')"
    onfocus="showTooltip('tooltip-2')"
    onblur="hideTooltip('tooltip-2')"
    class="inline-flex items-center justify-center w-10 h-10 text-body bg-white border border-slate-200 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
    <svg class="w-5 h-5" ...></svg>
  </button>
  <div id="tooltip-2" role="tooltip"
    class="tooltip-top absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-600 text-white text-sm rounded-lg shadow-sm px-3 py-2 z-20 opacity-0 pointer-events-none transition-opacity duration-200">
    設定を開く
  </div>
</div>
```

### JavaScript

```javascript
function showTooltip(id) {
  var el = document.getElementById(id);
  if (el) {
    el.classList.remove('opacity-0', 'pointer-events-none');
    el.classList.add('opacity-100');
  }
}
function hideTooltip(id) {
  var el = document.getElementById(id);
  if (el) {
    el.classList.remove('opacity-100');
    el.classList.add('opacity-0', 'pointer-events-none');
  }
}
// Escape で全ツールチップを非表示
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('[role="tooltip"]').forEach(function(tip) {
      tip.classList.remove('opacity-100');
      tip.classList.add('opacity-0', 'pointer-events-none');
    });
  }
});
```
