# Dropdown Menu

> ドロップダウンメニューコンポーネント仕様。
> Tailwind CSS 4

---

## 1. 原則

- **アクション実行の第一選択**: クリックして即時にアクションを実行するメニュー。フォーム内の値選択には Select を使う
- **トリガーは Button**: ボタンクリックで開閉する。ホバーでは開かない
- **即時実行**: メニューアイテム選択 → 即アクション。確認が必要な操作はモーダルを併用する
- **自動閉じ**: 外部クリック / Escape キーでメニューを閉じる

### Select との違い

| | Dropdown Menu | Select |
|--|---------------|--------|
| 用途 | アクション実行 | フォーム内の値選択 |
| 確定 | 即時実行 | フォーム送信で確定 |
| ARIA | `role="menu"` + `role="menuitem"` | `<select>` ネイティブ要素 |
| 例 | プロフィールメニュー、設定、「その他」 | カテゴリ選択、地域選択 |

---

## 2. 解剖

```
         +-- Trigger Button --------------------------+
         | [Icon]  メニューテキスト          [▼]       |
         +--------------------------------------------+
         +-- Menu Container --------------------------+
         | [Group Label]                               |
         | ┌────────────────────────────────────────┐ |
         | │ [Icon]  メニューアイテム 1              │ |
         | ├────────────────────────────────────────┤ |
         | │ [Icon]  メニューアイテム 2              │ |
         | ├─── Separator ─────────────────────────┤ |
         | │ [Icon]  破壊的アクション（赤）         │ |
         | └────────────────────────────────────────┘ |
         +--------------------------------------------+
```

| パーツ | 役割 | 必須 |
|--------|------|------|
| Trigger Button | メニューの開閉を制御するボタン | Yes |
| Menu Container | メニュー全体のコンテナ。z-20, rounded-lg, shadow-md, border | Yes |
| Menu Item | 個々のアクション項目。hover:bg-gray-50, px-3 py-2 | Yes |
| Leading Icon | アイテムの意味を補強するアイコン。w-4 h-4, text-body | No |
| Separator | メニューアイテムのグループ区切り。border-t border-slate-200 my-1 | No |
| Menu Group Label | グループの見出しテキスト。text-xs font-medium text-slate-500 px-3 py-1.5 | No |

---

## 3. パターン

### 3-1. 状態

| 状態 | Menu Item のスタイル | 説明 |
|------|---------------------|------|
| Default | `text-slate-700 bg-white` | 初期状態 |
| Hover | `text-slate-900 bg-gray-50` | マウスオーバー時 |
| Focus | `text-slate-900 bg-gray-50 outline-none ring-2 ring-primary-500/50` | キーボードフォーカス時 |
| Active | `text-slate-900 bg-gray-100` | クリック中 |
| Disabled | `text-slate-400 cursor-not-allowed` | 選択不可 |
| Destructive | `text-red-600 hover:bg-red-50` | 破壊的アクション（削除等） |

### 3-2. 配置

| 配置 | クラス | 説明 |
|------|--------|------|
| bottom-start | `top-full left-0 mt-1` | デフォルト。ボタンの左端に揃え下に展開 |
| bottom-end | `top-full right-0 mt-1` | ボタンの右端に揃え下に展開 |

### 3-3. バリエーション

| バリエーション | 説明 | 用途 |
|----------------|------|------|
| 基本 | テキストのみのメニューアイテム | シンプルなアクション一覧 |
| アイコン付き | 左端にアイコンを配置 | 設定メニュー・プロフィールメニュー |
| グループ付き | セパレータとグループラベルで分類 | 多機能なコンテキストメニュー |
| 破壊的アクション含む | 赤テキスト + セパレータで分離 | 削除・ログアウト等の不可逆操作 |

---

## 4. 振る舞い

### 4-1. 開閉

| トリガー | 動作 |
|----------|------|
| ボタンクリック | メニューを開閉する（トグル） |
| Enter / Space | フォーカス時にメニューを開閉する |
| Escape | メニューを閉じ、フォーカスをトリガーボタンに戻す |
| メニューアイテムクリック | アクションを実行しメニューを閉じる |
| 外部クリック | メニューを閉じる |

### 4-2. キーボードナビゲーション

- `Arrow Down`: 次のメニューアイテムに移動（末尾→先頭にループ）
- `Arrow Up`: 前のメニューアイテムに移動（先頭→末尾にループ）
- `Home`: 最初のメニューアイテムに移動
- `End`: 最後のメニューアイテムに移動
- `Tab`: メニューを閉じフォーカスを次の要素に移す

### 4-3. 開いた直後

- 最初のメニューアイテムにフォーカスが移る
- メニューはトリガーボタンの直下に表示される

### 4-4. アニメーション

- 表示: `transition-opacity duration-150 ease-out`（opacity 0→1）
- 非表示: 即座に非表示（遅延なし）

---

## 5. アクセシビリティ

| 項目 | 要件 |
|------|------|
| Trigger Button | `aria-haspopup="true"`, `aria-expanded="true/false"` |
| Menu Container | `role="menu"` |
| Menu Item | `role="menuitem"`, `tabindex="-1"`（roving tabindex） |
| Separator | `role="separator"` |
| Disabled Item | `aria-disabled="true"` |
| 破壊的アクション | 視覚的な赤テキスト + テキストで意図を明示する |
| キーボード操作 | Arrow Up/Down で移動、Home/End で先頭/末尾、Escape で閉じる |

### 禁止事項

> 共通: `foundations/prohibited.md`「アクセシビリティ」参照

- ホバーだけでメニューを開くこと（アクセシビリティ問題）
- `aria-haspopup` なしのトリガー
- セパレータに `role="menuitem"` を付与すること
- Disabled アイテムにフォーカスを移すこと

---

## 6. Tailwind サンプル

> primary カラーの具体値は `foundations/theme.md` を参照。

### 6-1. 基本

```html
<div class="relative inline-block">
  <button
    type="button"
    id="menu-trigger"
    aria-haspopup="true"
    aria-expanded="false"
    onclick="toggleMenu('basic-menu', this)"
    class="inline-flex items-center gap-2 bg-white text-slate-700 border border-slate-200 h-10 px-4 rounded-lg text-[1rem] font-medium hover:bg-gray-50 transition-colors">
    オプション
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
    </svg>
  </button>
  <div
    id="basic-menu"
    role="menu"
    class="hidden absolute top-full left-0 mt-1 w-48 bg-white rounded-lg border border-slate-200 shadow-md z-20 py-1 transition-opacity duration-150 ease-out">
    <button role="menuitem" tabindex="-1" class="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-gray-50 hover:text-slate-900 transition-colors" onclick="alert('編集')">編集</button>
    <button role="menuitem" tabindex="-1" class="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-gray-50 hover:text-slate-900 transition-colors" onclick="alert('複製')">複製</button>
    <button role="menuitem" tabindex="-1" class="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-gray-50 hover:text-slate-900 transition-colors" onclick="alert('共有')">共有</button>
  </div>
</div>
```

### 6-2. アイコン付き + セパレータ + 破壊的アクション

```html
<div class="relative inline-block">
  <button
    type="button"
    aria-haspopup="true"
    aria-expanded="false"
    onclick="toggleMenu('icon-menu', this)"
    class="inline-flex items-center gap-2 bg-white text-slate-700 border border-slate-200 h-10 px-4 rounded-lg text-[1rem] font-medium hover:bg-gray-50 transition-colors">
    アカウント
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
    </svg>
  </button>
  <div
    id="icon-menu"
    role="menu"
    class="hidden absolute top-full left-0 mt-1 w-56 bg-white rounded-lg border border-slate-200 shadow-md z-20 py-1 transition-opacity duration-150 ease-out">
    <button role="menuitem" tabindex="-1" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-gray-50 hover:text-slate-900 transition-colors">
      <svg class="w-4 h-4 text-body" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
      プロフィール
    </button>
    <button role="menuitem" tabindex="-1" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-gray-50 hover:text-slate-900 transition-colors">
      <svg class="w-4 h-4 text-body" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
      設定
    </button>
    <div role="separator" class="border-t border-slate-200 my-1"></div>
    <button role="menuitem" tabindex="-1" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
      ログアウト
    </button>
  </div>
</div>
```

### 6-3. グループ付き

```html
<div class="relative inline-block">
  <button
    type="button"
    aria-haspopup="true"
    aria-expanded="false"
    onclick="toggleMenu('group-menu', this)"
    class="inline-flex items-center gap-2 bg-white text-slate-700 border border-slate-200 h-10 px-4 rounded-lg text-[1rem] font-medium hover:bg-gray-50 transition-colors">
    その他
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
    </svg>
  </button>
  <div
    id="group-menu"
    role="menu"
    class="hidden absolute top-full left-0 mt-1 w-56 bg-white rounded-lg border border-slate-200 shadow-md z-20 py-1 transition-opacity duration-150 ease-out">
    <div class="px-3 py-1.5">
      <p class="text-xs font-medium text-slate-500">編集</p>
    </div>
    <button role="menuitem" tabindex="-1" class="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-gray-50 hover:text-slate-900 transition-colors">元に戻す</button>
    <button role="menuitem" tabindex="-1" class="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-gray-50 hover:text-slate-900 transition-colors">やり直す</button>
    <div role="separator" class="border-t border-slate-200 my-1"></div>
    <div class="px-3 py-1.5">
      <p class="text-xs font-medium text-slate-500">管理</p>
    </div>
    <button role="menuitem" tabindex="-1" class="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-gray-50 hover:text-slate-900 transition-colors">アーカイブ</button>
    <div role="separator" class="border-t border-slate-200 my-1"></div>
    <button role="menuitem" tabindex="-1" class="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">削除</button>
  </div>
</div>
```

### 6-4. JavaScript（メニュー開閉・キーボードナビ・外部クリック閉じ）

```javascript
function toggleMenu(menuId, trigger) {
  var menu = document.getElementById(menuId);
  var isOpen = !menu.classList.contains('hidden');

  // 全メニューを閉じる
  document.querySelectorAll('[role="menu"]').forEach(function(m) {
    m.classList.add('hidden');
  });
  document.querySelectorAll('[aria-expanded]').forEach(function(btn) {
    btn.setAttribute('aria-expanded', 'false');
  });

  if (!isOpen) {
    menu.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    // 最初のアイテムにフォーカス
    var firstItem = menu.querySelector('[role="menuitem"]:not([aria-disabled="true"])');
    if (firstItem) firstItem.focus();
  }
}

// キーボードナビゲーション
document.addEventListener('keydown', function(e) {
  var menu = e.target.closest('[role="menu"]');
  if (!menu) return;

  var items = Array.from(menu.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])'));
  var idx = items.indexOf(e.target);
  if (idx === -1) return;

  var newIdx = -1;
  if (e.key === 'ArrowDown') {
    newIdx = (idx + 1) % items.length;
  } else if (e.key === 'ArrowUp') {
    newIdx = (idx - 1 + items.length) % items.length;
  } else if (e.key === 'Home') {
    newIdx = 0;
  } else if (e.key === 'End') {
    newIdx = items.length - 1;
  } else if (e.key === 'Escape') {
    var trigger = document.querySelector('[aria-expanded="true"]');
    menu.classList.add('hidden');
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    }
    e.preventDefault();
    return;
  }

  if (newIdx >= 0) {
    e.preventDefault();
    items[newIdx].focus();
  }
});

// 外部クリックで閉じる
document.addEventListener('click', function(e) {
  document.querySelectorAll('[role="menu"]:not(.hidden)').forEach(function(menu) {
    var trigger = document.querySelector('[aria-expanded="true"]');
    if (!menu.contains(e.target) && (!trigger || !trigger.contains(e.target))) {
      menu.classList.add('hidden');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }
  });
});
```
