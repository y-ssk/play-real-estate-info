# Tag / Chip

> ユーザーが管理するメタデータを表現するインタラクティブラベルコンポーネント仕様。
> Tailwind CSS 4

---

## 1. 原則

- **ユーザーが管理するメタデータを表現する**: Badge（ステータス表示・単方向）とは異なり、Tag はユーザーが追加・削除・選択する双方向コンポーネントである
- **削除操作は明示的に**: ×ボタンを必ず表示し、キーボードでもアクセス可能にする
- **複数タグのグループ管理を前提とする**: role="list" / role="listbox" でグループのセマンティクスを提供する
- **フィルターチップは on/off 状態を明確に伝える**: 色・アイコン・`aria-selected` で選択状態を伝達する

---

## 2. 解剖

### Basic Tag（削除可能タグ）

```
┌─────────────────────┐
│  Label         [×]  │  ← Tag
└─────────────────────┘
```

| パーツ | 役割 | 必須 |
|--------|------|------|
| Container | タグの外枠。背景色とボーダーで種類を示す | Yes |
| Label Text | タグのテキスト（カテゴリ名、キーワード等） | Yes |
| Remove Button | ×アイコンのボタン。クリック/キーボードで削除 | Yes（削除可能タグの場合） |

### Filter Chip（トグル選択チップ）

```
Active:    ┌──────────────────┐
           │  [✓] Label       │
           └──────────────────┘

Inactive:  ┌──────────────────┐
           │  Label           │
           └──────────────────┘
```

| パーツ | 役割 | 必須 |
|--------|------|------|
| Container | チップの外枠。選択状態で背景色・ボーダーが変化する | Yes |
| Checkmark Icon | Active 時のみ表示。選択状態を視覚的に補強 | Yes（Active 時） |
| Label Text | フィルター条件のテキスト | Yes |

---

## 3. パターン

### 3-1. Basic Tag（削除可能タグ）

ユーザーが付与したカテゴリ、キーワード、ラベル等のメタデータを表示する。×ボタンで削除可能。

**カラーバリエーション**:

| バリエーション | 背景 / テキスト | 用途 |
|----------------|----------------|------|
| Primary | `bg-primary-50 text-primary-700` | デフォルト。汎用タグ |
| Slate | `bg-slate-100 text-slate-700` | ニュートラル。控えめなタグ |
| Emerald | `bg-emerald-50 text-emerald-700` | 成功・完了に関連するタグ |
| Amber | `bg-amber-50 text-amber-700` | 注意・優先度に関連するタグ |
| Red | `bg-red-50 text-red-700` | 重要・緊急に関連するタグ |

### 3-2. Filter Chip（トグル選択チップ）

フィルター条件のオン/オフを切り替える。複数選択可能。

| 状態 | スタイル |
|------|---------|
| Active | `bg-primary-50 border-primary-200 text-primary-700` + チェックマーク |
| Inactive | `bg-white border-slate-200 text-slate-700` |

### 3-3. タグ入力フィールド

テキスト入力から Enter キーでタグを追加し、×で削除できる複合パターン。入力欄とタグリストを同一の外枠内に配置する。

---

## 4. 振る舞い

### Basic Tag

- **削除**: ×ボタンのクリック / Delete キー / Backspace キーでタグを削除する
- **×ボタン**: タップ領域を最低 24×24px 確保する
- **削除時のフィードバック**: タグがリストから即座に消える（アニメーションは 150ms 以下の opacity fade）

### Filter Chip

- **トグル**: クリック / Enter / Space キーで Active ⇔ Inactive を切り替える
- **複数選択**: 複数のチップを同時に Active にできる
- **状態変更のフィードバック**: チェックマークの表示/非表示 + 背景色の切り替え

### フォーカス管理

- **Tab**: タググループへ入る / タググループから次の要素へ出る
- **Arrow Left / Right**: グループ内のタグ間を移動する
- **フォーカスリング**: `focus:ring-2 focus:ring-primary-500/50` を適用する

---

## 5. アクセシビリティ

### Basic Tag

| 属性 | 値 | 対象 |
|------|------|------|
| `role` | `"list"` | タググループのコンテナ |
| `role` | `"listitem"` | 各タグ |
| `aria-label` | `"{タグ名}を削除"` | ×ボタン |
| `tabindex` | `"0"` | ×ボタン（フォーカス可能にする） |

### Filter Chip

| 属性 | 値 | 対象 |
|------|------|------|
| `role` | `"listbox"` | フィルターチップグループ |
| `role` | `"option"` | 各フィルターチップ |
| `aria-selected` | `"true"` / `"false"` | 各フィルターチップの選択状態 |
| `aria-label` | `"{フィルター名}で絞り込む"` | 各フィルターチップ |

### 共通

- ×ボタンのタップ領域は最低 24×24px を確保する
- 色だけで状態を伝達しない（チェックマーク / ×アイコンを必ず併用する）
- `prefers-reduced-motion` でアニメーションを停止する

---

## 6. Tailwind サンプル

### Basic Tag（5色バリエーション）

```html
<!-- Primary -->
<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary-700">
  デザイン
  <button type="button" aria-label="デザインを削除" class="ml-0.5 -mr-1 p-0.5 flex items-center justify-center rounded-full text-primary-400 hover:text-primary-500 hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
  </button>
</span>

<!-- Slate -->
<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
  アーカイブ
  <button type="button" aria-label="アーカイブを削除" class="ml-0.5 -mr-1 p-0.5 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
  </button>
</span>

<!-- Emerald -->
<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
  完了済み
  <button type="button" aria-label="完了済みを削除" class="ml-0.5 -mr-1 p-0.5 flex items-center justify-center rounded-full text-emerald-400 hover:text-emerald-600 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
  </button>
</span>

<!-- Amber -->
<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
  優先
  <button type="button" aria-label="優先を削除" class="ml-0.5 -mr-1 p-0.5 flex items-center justify-center rounded-full text-amber-400 hover:text-amber-600 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
  </button>
</span>

<!-- Red -->
<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700">
  緊急
  <button type="button" aria-label="緊急を削除" class="ml-0.5 -mr-1 p-0.5 flex items-center justify-center rounded-full text-red-400 hover:text-red-600 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
  </button>
</span>
```

### Filter Chip（Active / Inactive）

```html
<!-- Active -->
<button type="button" role="option" aria-selected="true" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border bg-primary-50 border-primary-200 text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
  フロントエンド
</button>

<!-- Inactive -->
<button type="button" role="option" aria-selected="false" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border bg-white border-slate-200 text-slate-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
  バックエンド
</button>
```

### タググループ（Basic Tag）

```html
<div role="list" class="flex flex-wrap gap-2">
  <span role="listitem" class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary-700">
    デザイン
    <button type="button" aria-label="デザインを削除" class="ml-0.5 -mr-1 p-0.5 flex items-center justify-center rounded-full text-primary-400 hover:text-primary-500 hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>
  </span>
  <span role="listitem" class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary-700">
    開発
    <button type="button" aria-label="開発を削除" class="ml-0.5 -mr-1 p-0.5 flex items-center justify-center rounded-full text-primary-400 hover:text-primary-500 hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>
  </span>
</div>
```

### Filter Chip グループ

```html
<div role="listbox" aria-label="カテゴリでフィルター" aria-multiselectable="true" class="flex flex-wrap gap-2">
  <button type="button" role="option" aria-selected="true" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border bg-primary-50 border-primary-200 text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
    フロントエンド
  </button>
  <button type="button" role="option" aria-selected="false" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border bg-white border-slate-200 text-slate-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
    バックエンド
  </button>
  <button type="button" role="option" aria-selected="true" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border bg-primary-50 border-primary-200 text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
    デザイン
  </button>
  <button type="button" role="option" aria-selected="false" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border bg-white border-slate-200 text-slate-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
    QA
  </button>
</div>
```

### タグ入力フィールド

```html
<div class="w-full border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:border-primary-500 px-3 py-2 flex flex-wrap gap-2 items-center">
  <!-- 既存タグ -->
  <span role="listitem" class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary-700">
    JavaScript
    <button type="button" aria-label="JavaScriptを削除" class="ml-0.5 -mr-1 p-0.5 flex items-center justify-center rounded-full text-primary-400 hover:text-primary-500 hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>
  </span>
  <span role="listitem" class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary-700">
    React
    <button type="button" aria-label="Reactを削除" class="ml-0.5 -mr-1 p-0.5 flex items-center justify-center rounded-full text-primary-400 hover:text-primary-500 hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>
  </span>
  <!-- 入力欄 -->
  <input type="text" placeholder="タグを入力して Enter" class="flex-1 min-w-[120px] outline-none text-base text-slate-900 placeholder:text-slate-400 caret-primary-500 bg-transparent">
</div>
```

---

## 禁止事項

> 共通: `foundations/prohibited.md`「タグ・チップ」参照

- ×ボタンなしの削除可能タグ（キーボードのみでは削除操作を発見できない）
- 24px 未満の×ボタンタップ領域
- `aria-label` なしの×ボタン
- Filter Chip で `aria-selected` を省略すること
- Badge（ステータス表示）と Tag（ユーザー管理メタデータ）の混同使用
