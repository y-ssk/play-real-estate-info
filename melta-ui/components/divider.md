# Divider

> セクション間やコンテンツ間の視覚的な区切りを提供するコンポーネント仕様。
> Tailwind CSS 4

---

## 1. 原則

- **最小限の存在感**: 区切りは主張せず、コンテンツの構造を静かに伝える
- **セマンティック HTML**: 水平区切りには `<hr>` を使用し、垂直・テキスト付きには `role="separator"` を付与する
- **一貫した色**: `border-slate-200` を標準とし、強調時のみ `border-slate-300` を許可する

---

## 2. 解剖

```
水平:
+──────────────────────────────────────+

テキスト付き水平:
+─────────────  または  ─────────────+

垂直:
|  Content A  │  Content B  |
```

| パーツ | 役割 | 必須 |
|--------|------|------|
| Line | 区切り線本体 | Yes |
| Label | 中央に配置するテキスト（テキスト付きの場合） | No |
| Container | 垂直ディバイダーを含む親要素 | 垂直のみ |

---

## 3. パターン

| パターン | 説明 | 用途 |
|----------|------|------|
| 水平（デフォルト） | 標準的な横区切り線 | セクション間、カード内の区切り |
| テキスト付き水平 | 中央にラベルを配置した横区切り | 「または」等の代替手段の提示 |
| 垂直 | 縦方向の区切り線 | 横並びコンテンツ間の分離 |
| 濃い線 | `border-slate-300` を使用 | より強い視覚的分離が必要な場合 |

### 3-1. マージンバリエーション

| バリエーション | クラス | 用途 |
|---------------|--------|------|
| 標準 | `my-6` | セクション内の区切り |
| 広い | `my-8` 〜 `my-10` | セクション間の区切り |
| なし | マージンなし | カード内 `divide-y` 等で親が制御 |

---

## 4. 振る舞い

> このコンポーネントは静的表示のため、スタイル仕様を記載する。

### 4-1. 水平（デフォルト）

```
<hr> : border-t border-slate-200
```

### 4-2. テキスト付き水平

```
Container  : flex items-center gap-4
左右の線    : flex-1 border-t border-slate-200（<div> で実装）
ラベル      : text-sm text-slate-500 flex-shrink-0
```

### 4-3. 垂直

```
Line : border-l border-slate-200 self-stretch
```

### 4-4. 濃い線

```
<hr> : border-t border-slate-300
```

---

## 5. アクセシビリティ

| 項目 | 要件 |
|------|------|
| 水平区切り | `<hr>` 要素を使用する（暗黙の `role="separator"`） |
| テキスト付き | `role="separator"` を Container に付与 |
| 垂直区切り | `role="separator" aria-orientation="vertical"` を付与 |
| 装飾的な区切り | `role="presentation"` で支援技術から隠す |

### 禁止事項

> 共通: `foundations/prohibited.md`「ディバイダー」参照

- `<div>` + `border-b` で水平区切りを実装すること（`<hr>` を使用する）
- `border-slate-400` 以上の濃い区切り線（`border-slate-200` / `border-slate-300` のみ）

---

## 6. Tailwind サンプル

### 6-1. 水平（デフォルト）

```html
<hr class="border-t border-slate-200 my-6">
```

### 6-2. テキスト付き水平

```html
<div role="separator" class="flex items-center gap-4 my-6">
  <div class="flex-1 border-t border-slate-200"></div>
  <span class="text-sm text-slate-500 flex-shrink-0">または</span>
  <div class="flex-1 border-t border-slate-200"></div>
</div>
```

### 6-3. 垂直

```html
<div class="flex items-center gap-6">
  <div class="text-sm text-body">セクション A</div>
  <div role="separator" aria-orientation="vertical" class="border-l border-slate-200 self-stretch"></div>
  <div class="text-sm text-body">セクション B</div>
</div>
```

### 6-4. 濃い線

```html
<hr class="border-t border-slate-300 my-8">
```
