# Pagination

> ページ送りナビゲーションコンポーネント仕様。
> Tailwind CSS 4

---

## 1. 原則

- **ページ移動**: コンテンツを複数ページに分割し、ページ間を移動する
- **タップ領域確保**: ボタンは `w-10 h-10`（44px 相当）でモバイルタップに対応
- **現在位置の明示**: アクティブページを色・形で明確に区別する
- **Ellipsis 対応**: ページ数が多い場合は `...` で中間を省略する

---

## 2. 解剖

```
  [<]  [1]  [2]  [3]  [4]  [5]  [>]
```

| パーツ | 役割 | 必須 |
|--------|------|------|
| Nav Container | `<nav aria-label="ページネーション">` | Yes |
| Page Button | ページ番号ボタン | Yes |
| Prev Button | 前のページへ移動 | Yes |
| Next Button | 次のページへ移動 | Yes |
| Ellipsis | 省略記号 `...` | No |

---

## 3. パターン

### 3-1. 状態

| 状態 | スタイル |
|------|---------|
| Active | `bg-primary-500 text-white rounded-lg` |
| Inactive | `bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-gray-50` |
| Disabled | `text-slate-300 cursor-not-allowed` |
| Ellipsis | `text-slate-500`（クリック不可） |

### 3-2. バリエーション

| バリエーション | 説明 |
|----------------|------|
| 基本 | 連続ページ番号 + prev/next |
| Ellipsis 付き | `1 ... 4 [5] 6 ... 20` 形式 |

---

## 4. 振る舞い

> このコンポーネントは静的表示のため、スタイル仕様を記載する。

### Page Button

```
w-10 h-10 inline-flex items-center justify-center text-base font-medium rounded-lg
```

| 状態 | クラス |
|------|--------|
| Active | `text-white bg-primary-500` |
| Inactive | `text-slate-700 bg-white border border-slate-200 hover:bg-gray-50 transition-colors` |

### Prev/Next Button

```
w-10 h-10 inline-flex items-center justify-center rounded-lg
```

| 状態 | クラス |
|------|--------|
| 有効 | `text-slate-700 bg-white border border-slate-200 hover:bg-gray-50 transition-colors` |
| Disabled | `text-slate-300 cursor-not-allowed` |

### Ellipsis

```
w-10 h-10 inline-flex items-center justify-center text-slate-500
```

### レイアウト

```
flex items-center gap-1
```

---

## 5. アクセシビリティ

| 属性 | 値 |
|------|------|
| `<nav aria-label>` | `"ページネーション"` |
| `aria-current` | アクティブページに `"page"` を設定 |
| `aria-label` | 各ボタンに `"ページ N"` / `"前のページ"` / `"次のページ"` |
| Disabled | 先頭ページでは prev を disabled、末尾ページでは next を disabled |
| タップ領域 | `w-10 h-10`（44px 相当）を確保 |

> 共通: prohibited.md「カラー」「アクセシビリティ」参照

---

## 6. Tailwind サンプル

### 基本

```html
<nav aria-label="ページネーション">
  <ul class="flex items-center gap-1">
    <li>
      <button disabled class="w-10 h-10 inline-flex items-center justify-center text-slate-300 cursor-not-allowed rounded-lg" aria-label="前のページ">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
      </button>
    </li>
    <li><button class="w-10 h-10 inline-flex items-center justify-center text-base font-medium text-white bg-primary-500 rounded-lg" aria-current="page" aria-label="ページ 1">1</button></li>
    <li><button class="w-10 h-10 inline-flex items-center justify-center text-base font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-gray-50 transition-colors" aria-label="ページ 2">2</button></li>
    <li><button class="w-10 h-10 inline-flex items-center justify-center text-base font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-gray-50 transition-colors" aria-label="ページ 3">3</button></li>
    <li>
      <button class="w-10 h-10 inline-flex items-center justify-center text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-gray-50 transition-colors" aria-label="次のページ">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
      </button>
    </li>
  </ul>
</nav>
```

### Ellipsis 付き

```html
<nav aria-label="ページネーション">
  <ul class="flex items-center gap-1">
    <li><button class="..." aria-label="前のページ">←</button></li>
    <li><button class="..." aria-label="ページ 1">1</button></li>
    <li><span class="w-10 h-10 inline-flex items-center justify-center text-slate-500" aria-hidden="true">...</span></li>
    <li><button class="..." aria-label="ページ 4">4</button></li>
    <li><button class="... text-white bg-primary-500" aria-current="page" aria-label="ページ 5">5</button></li>
    <li><button class="..." aria-label="ページ 6">6</button></li>
    <li><span class="w-10 h-10 inline-flex items-center justify-center text-slate-500" aria-hidden="true">...</span></li>
    <li><button class="..." aria-label="ページ 20">20</button></li>
    <li><button class="..." aria-label="次のページ">→</button></li>
  </ul>
</nav>
```
