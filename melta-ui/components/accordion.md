# Accordion

> 折りたたみセクションコンポーネント仕様。
> Tailwind CSS 4

---

## 1. 原則

- **段階的開示**: 情報を折りたたんで表示し、必要なときに展開する。ページの見通しを保つ
- **1クリックで開閉**: トリガーをクリックするだけで展開・折りたたみできる
- **デフォルトは全閉じ**: 初期状態はすべて閉じた状態。重要な情報がある場合のみデフォルト展開可
- **`<details>/<summary>` 不使用**: アニメーション制御が困難なため、`<div>` + `<button>` + JS で制御する

---

## 2. 解剖

```
+------------------------------------------------------------+
| [▼ Trigger Label]                              PullDown ↕  |
+------------------------------------------------------------+
|                                                            |
|  Panel content — 展開時のみ表示                              |
|                                                            |
+------------------------------------------------------------+
```

| パーツ | 役割 | 必須 |
|--------|------|------|
| Container | Accordion 全体を囲むラッパー | Yes |
| Item | 個々の折りたたみ項目（Trigger + Panel のペア） | Yes |
| Trigger | 展開・折りたたみを操作する `<button>` | Yes |
| Icon | 開閉状態を示す PullDown アイコン（回転で表現） | Yes |
| Panel | 展開時に表示されるコンテンツ領域 | Yes |

---

## 3. パターン

### 3-1. 展開モード

| モード | 説明 | 用途 |
|--------|------|------|
| 単一展開 | 1つ開くと他のパネルが自動で閉じる | FAQ、設定パネル |
| 複数展開 | 複数のパネルを同時に開ける | 詳細情報、フィルター |

### 3-2. バリエーション

| バリエーション | 説明 | 用途 |
|----------------|------|------|
| ボーダーあり | アイテム間に `border-b` を表示 | 標準的なリスト（FAQ 等） |
| ボーダーなし | アイテム間のボーダーを省略 | カード内のセクション、軽量な表示 |
| デフォルト展開 | 特定のパネルを初期状態で開いておく | 重要な情報を最初から表示 |

---

## 4. 振る舞い

### 4-1. アニメーション

| 対象 | 動作 |
|------|------|
| PullDown アイコン | `rotate-180` + `duration-200` で回転 |
| パネル展開 | `max-height` + `overflow-hidden` で高さをアニメーション |
| パネル折りたたみ | `max-height: 0` に戻す |
| `prefers-reduced-motion` | アニメーションを無効にし、即時切り替え |

### 4-2. 操作

| 操作 | 動作 |
|------|------|
| Trigger クリック | パネルの展開・折りたたみを切り替える |
| 単一展開モード | 他のパネルが開いている場合、自動で閉じてから開く |
| 複数展開モード | 他のパネルの状態に影響しない |

---

## 5. アクセシビリティ

| 項目 | 要件 |
|------|------|
| Trigger | `<button>` 要素を使用する（`<div>` や `<a>` は不可） |
| `aria-expanded` | Trigger に付与。展開時 `true`、折りたたみ時 `false` |
| `aria-controls` | Trigger に付与。対応する Panel の `id` を指定 |
| Panel `id` | 各 Panel にユニークな `id` を付与 |
| キーボード | Enter / Space で開閉できる（`<button>` のデフォルト動作） |
| フォーカス | Trigger にフォーカスインジケーターを表示（`focus:outline` 等） |

### 禁止事項

> 共通: `foundations/prohibited.md`「カラー」参照

- Trigger に `<div>` や `<a>` を使用すること（`<button>` を使用する）
- パネル内の重要な情報をキーボードで到達不能にすること
- 展開状態を色だけで伝達すること（アイコン回転で明示する）

---

## 6. Tailwind サンプル

> アイコンは `assets/icons/PullDown.svg`（Charcoal Icons、fill ベース）。

### 6-1. 単一展開（ボーダーあり）

```html
<div class="bg-white rounded-xl border border-slate-200 divide-y divide-slate-200">
  <!-- Item 1 -->
  <div>
    <button onclick="toggleAccordion(this, 'single')" aria-expanded="false" aria-controls="panel-1"
      class="w-full flex items-center justify-between py-4 px-6 text-left text-base font-medium text-slate-900 hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-inset">
      <span>アカウント設定について</span>
      <svg class="w-5 h-5 text-slate-500 transition-transform duration-200 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <!-- PullDown.svg -->
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
      </svg>
    </button>
    <div id="panel-1" class="overflow-hidden max-h-0 transition-all duration-200">
      <div class="px-6 pb-4 text-sm text-body">
        アカウント設定はプロフィールページから変更できます。メールアドレス、パスワード、通知設定などを管理できます。
      </div>
    </div>
  </div>

  <!-- Item 2 -->
  <div>
    <button onclick="toggleAccordion(this, 'single')" aria-expanded="false" aria-controls="panel-2"
      class="w-full flex items-center justify-between py-4 px-6 text-left text-base font-medium text-slate-900 hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-inset">
      <span>料金プランの変更</span>
      <svg class="w-5 h-5 text-slate-500 transition-transform duration-200 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
      </svg>
    </button>
    <div id="panel-2" class="overflow-hidden max-h-0 transition-all duration-200">
      <div class="px-6 pb-4 text-sm text-body">
        料金プランは設定画面の「プラン」セクションから変更できます。アップグレード・ダウングレードはいつでも可能です。
      </div>
    </div>
  </div>

  <!-- Item 3 -->
  <div>
    <button onclick="toggleAccordion(this, 'single')" aria-expanded="false" aria-controls="panel-3"
      class="w-full flex items-center justify-between py-4 px-6 text-left text-base font-medium text-slate-900 hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-inset">
      <span>データのエクスポート</span>
      <svg class="w-5 h-5 text-slate-500 transition-transform duration-200 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
      </svg>
    </button>
    <div id="panel-3" class="overflow-hidden max-h-0 transition-all duration-200">
      <div class="px-6 pb-4 text-sm text-body">
        設定画面の「データ管理」からCSV形式でエクスポートできます。エクスポートには最大数分かかる場合があります。
      </div>
    </div>
  </div>
</div>
```

### 6-2. 複数展開（ボーダーあり）

```html
<div class="bg-white rounded-xl border border-slate-200 divide-y divide-slate-200">
  <!-- Item 1 -->
  <div>
    <button onclick="toggleAccordion(this, 'multi')" aria-expanded="false" aria-controls="multi-panel-1"
      class="w-full flex items-center justify-between py-4 px-6 text-left text-base font-medium text-slate-900 hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-inset">
      <span>通知設定</span>
      <svg class="w-5 h-5 text-slate-500 transition-transform duration-200 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
      </svg>
    </button>
    <div id="multi-panel-1" class="overflow-hidden max-h-0 transition-all duration-200">
      <div class="px-6 pb-4 text-sm text-body">
        メール通知、プッシュ通知、アプリ内通知をそれぞれ個別に設定できます。
      </div>
    </div>
  </div>

  <!-- Item 2 -->
  <div>
    <button onclick="toggleAccordion(this, 'multi')" aria-expanded="false" aria-controls="multi-panel-2"
      class="w-full flex items-center justify-between py-4 px-6 text-left text-base font-medium text-slate-900 hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-inset">
      <span>セキュリティ設定</span>
      <svg class="w-5 h-5 text-slate-500 transition-transform duration-200 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
      </svg>
    </button>
    <div id="multi-panel-2" class="overflow-hidden max-h-0 transition-all duration-200">
      <div class="px-6 pb-4 text-sm text-body">
        二要素認証の有効化、ログイン履歴の確認、セッション管理が行えます。
      </div>
    </div>
  </div>
</div>
```

### 6-3. ボーダーなし

```html
<div class="space-y-1">
  <!-- Item 1 -->
  <div>
    <button onclick="toggleAccordion(this, 'multi')" aria-expanded="false" aria-controls="noborder-panel-1"
      class="w-full flex items-center justify-between py-3 px-4 text-left text-base font-medium text-slate-900 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50">
      <span>詳細オプション</span>
      <svg class="w-5 h-5 text-slate-500 transition-transform duration-200 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
      </svg>
    </button>
    <div id="noborder-panel-1" class="overflow-hidden max-h-0 transition-all duration-200">
      <div class="px-4 pb-3 text-sm text-body">
        高度な設定オプションはこちらから変更できます。
      </div>
    </div>
  </div>

  <!-- Item 2 -->
  <div>
    <button onclick="toggleAccordion(this, 'multi')" aria-expanded="false" aria-controls="noborder-panel-2"
      class="w-full flex items-center justify-between py-3 px-4 text-left text-base font-medium text-slate-900 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50">
      <span>開発者向け設定</span>
      <svg class="w-5 h-5 text-slate-500 transition-transform duration-200 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
      </svg>
    </button>
    <div id="noborder-panel-2" class="overflow-hidden max-h-0 transition-all duration-200">
      <div class="px-4 pb-3 text-sm text-body">
        API キーの管理、Webhook の設定、デバッグモードの切り替えが行えます。
      </div>
    </div>
  </div>
</div>
```

### 6-4. デフォルト展開

```html
<div class="bg-white rounded-xl border border-slate-200 divide-y divide-slate-200">
  <!-- Item 1: デフォルト展開 -->
  <div>
    <button onclick="toggleAccordion(this, 'multi')" aria-expanded="true" aria-controls="default-panel-1"
      class="w-full flex items-center justify-between py-4 px-6 text-left text-base font-medium text-slate-900 hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-inset">
      <span>重要なお知らせ</span>
      <svg class="w-5 h-5 text-slate-500 transition-transform duration-200 rotate-180 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
      </svg>
    </button>
    <div id="default-panel-1" class="overflow-hidden transition-all duration-200" style="max-height: 200px;">
      <div class="px-6 pb-4 text-sm text-body">
        このセクションはデフォルトで展開されています。重要な情報を最初から表示する場合に使用します。
      </div>
    </div>
  </div>

  <!-- Item 2: 閉じた状態 -->
  <div>
    <button onclick="toggleAccordion(this, 'multi')" aria-expanded="false" aria-controls="default-panel-2"
      class="w-full flex items-center justify-between py-4 px-6 text-left text-base font-medium text-slate-900 hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-inset">
      <span>その他の情報</span>
      <svg class="w-5 h-5 text-slate-500 transition-transform duration-200 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
      </svg>
    </button>
    <div id="default-panel-2" class="overflow-hidden max-h-0 transition-all duration-200">
      <div class="px-6 pb-4 text-sm text-body">
        追加の情報はこちらに記載されています。
      </div>
    </div>
  </div>
</div>
```
