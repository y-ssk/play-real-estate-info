# Toggle Switch

> トグルスイッチコンポーネント仕様。
> Tailwind CSS 4

---

## 1. 原則

- **即時反映**: 操作と同時に設定が反映される。確定ボタンは不要
- **ON/OFF の2値**: 二者択一の設定切り替えに使用する。複数選択にはCheckboxを使う
- **Checkbox との使い分け**: 送信ボタンで確定する場合はCheckbox、即時反映する場合はToggle Switchを使う
- **副作用を明示する**: トグル操作により何が変わるかをラベルと補足テキストで明確にする

---

## 2. 解剖

```
  Label Text                      [ (O)     ]
  補足テキスト                     ← Track + Thumb
```

| パーツ | 役割 | 必須 |
|--------|------|------|
| Track | ON/OFF を視覚的に示す背景レール | Yes |
| Thumb | トラック上を移動する丸型のつまみ | Yes |
| Label | 設定内容を説明するテキスト | Yes |
| Description | 設定の補足説明 | No |
| Status Text | 現在の状態を明示するテキスト（「ON」「OFF」） | No |

---

## 3. パターン

### 3-1. 状態

| 状態 | Track | Thumb | 説明 |
|------|-------|-------|------|
| OFF | `bg-slate-200` | 左寄せ・白 | 初期状態（無効） |
| ON | `bg-primary-500` | 右寄せ・白 | 有効状態 |
| OFF + Hover | `bg-slate-300` | 左寄せ・白 | マウスオーバー時 |
| ON + Hover | `bg-primary-700` | 右寄せ・白 | マウスオーバー時 |
| Focus | `ring-2 ring-primary-500/50` | | フォーカスリング表示 |
| Disabled OFF | `bg-slate-100` | 左寄せ・白・`opacity-50` | 操作不可（OFF） |
| Disabled ON | `bg-primary-300` | 右寄せ・白・`opacity-50` | 操作不可（ON） |

### 3-2. バリエーション

| バリエーション | 説明 | 用途 |
|----------------|------|------|
| 基本 | ラベル + トグル | 設定画面の各項目 |
| 説明付き | ラベル + 補足テキスト + トグル | 設定の影響範囲を補足 |
| ステータス表示付き | トグルの横に「ON/OFF」テキスト | 状態を明示的に伝えたい場合 |

### 3-3. サイズ

| サイズ | Track | Thumb | 用途 |
|--------|-------|-------|------|
| Small | `w-8 h-5` | `w-3.5 h-3.5` | テーブル内・密なレイアウト |
| Medium | `w-11 h-6` | `w-5 h-5` | 標準設定画面（デフォルト） |

---

## 4. 振る舞い

### 4-1. 状態遷移

```
OFF → ON（クリック / Space / Enter）
ON → OFF（クリック / Space / Enter）
```

- クリックまたはキーボード操作で即座に状態が切り替わる
- 状態変更と同時にバックエンドへの反映処理を行う
- 反映に失敗した場合は状態を元に戻し、エラートーストを表示する

### 4-2. キーボード操作

| キー | 動作 |
|------|------|
| Tab | トグルにフォーカスを移動 |
| Space | ON/OFF を切り替え |
| Enter | ON/OFF を切り替え |

### 4-3. 反映処理

1. トグル操作
2. UIを即座に更新（楽観的更新）
3. バックエンドにリクエスト送信
4. 成功: 何もしない（UIは更新済み）
5. 失敗: UIを元に戻し、エラートーストを表示

---

## 5. アクセシビリティ

| 項目 | 要件 |
|------|------|
| Role | `role="switch"` を付与（`<button>` に対して） |
| aria-checked | ON: `aria-checked="true"` / OFF: `aria-checked="false"` |
| Label 紐付け | `aria-labelledby` でラベルの `id` を参照、または `aria-label` を直接付与 |
| Description 紐付け | 補足テキストがある場合 `aria-describedby` で紐付ける |
| キーボード | Tab でフォーカス、Space / Enter で切り替え |
| フォーカスリング | フォーカス時にリングを視覚的に表示 |
| コントラスト | Track の ON/OFF 状態の色差は 3:1 以上 |
| Disabled | `aria-disabled="true"` を付与し、操作を無効にする |
| モーション | `prefers-reduced-motion` 時はThumbのスライドアニメーションを無効にする |

### 禁止事項

> 共通: `foundations/prohibited.md`「フォーム」「カラー」参照

- ラベルなしのトグルスイッチ
- 色だけで ON/OFF を伝達すること（Thumb の位置変化を必ず併用）
- 確定ボタンが必要な操作にトグルスイッチを使うこと（Checkbox を使う）
- `<input type="checkbox">` をスタイリングでトグルに見せること（`role="switch"` の `<button>` を使う）

---

## 6. Tailwind サンプル

> primary カラーの具体値は `foundations/theme.md` を参照。

> **行間の注意**: `body { line-height: 2.0 }` 環境では、ラベル + 説明テキストを含む `<div>` に `leading-normal` を付与して行間をリセットすること。詳細は `foundations/typography.md` 参照。

### 6-1. 基本

```html
<div class="flex items-center justify-between">
  <label id="toggle-label" class="text-sm font-medium text-slate-700">メール通知</label>
  <button
    type="button"
    role="switch"
    aria-checked="false"
    aria-labelledby="toggle-label"
    class="relative inline-flex h-6 w-11 items-center rounded-full bg-slate-200
           hover:bg-slate-300
           focus:outline-none focus:ring-2 focus:ring-primary-500/50
           transition-colors"
    onclick="this.setAttribute('aria-checked', this.getAttribute('aria-checked') === 'true' ? 'false' : 'true')">
    <span class="inline-block h-5 w-5 rounded-full bg-white shadow-sm
                 translate-x-0.5
                 transition-transform
                 [[aria-checked=true]_&]:translate-x-[22px]"></span>
  </button>
</div>
```

### 6-2. ON 状態

```html
<div class="flex items-center justify-between">
  <label id="toggle-on-label" class="text-sm font-medium text-slate-700">メール通知</label>
  <button
    type="button"
    role="switch"
    aria-checked="true"
    aria-labelledby="toggle-on-label"
    class="relative inline-flex h-6 w-11 items-center rounded-full bg-primary-500
           hover:bg-primary-700
           focus:outline-none focus:ring-2 focus:ring-primary-500/50
           transition-colors">
    <span class="inline-block h-5 w-5 rounded-full bg-white shadow-sm
                 translate-x-[22px]
                 transition-transform"></span>
  </button>
</div>
```

### 6-3. 説明付き

```html
<div class="flex items-start justify-between gap-4">
  <div class="leading-normal">
    <label id="toggle-desc-label" class="text-sm font-medium text-slate-700">二段階認証</label>
    <p id="toggle-desc" class="text-sm text-slate-500 mt-1">ログイン時に認証コードの入力が必要になります</p>
  </div>
  <button
    type="button"
    role="switch"
    aria-checked="true"
    aria-labelledby="toggle-desc-label"
    aria-describedby="toggle-desc"
    class="relative inline-flex h-6 w-11 items-center rounded-full bg-primary-500 flex-shrink-0
           hover:bg-primary-700
           focus:outline-none focus:ring-2 focus:ring-primary-500/50
           transition-colors">
    <span class="inline-block h-5 w-5 rounded-full bg-white shadow-sm
                 translate-x-[22px]
                 transition-transform"></span>
  </button>
</div>
```

### 6-4. 設定リスト

```html
<div class="divide-y divide-slate-100">
  <!-- 項目1 -->
  <div class="flex items-center justify-between py-4">
    <div class="leading-normal">
      <label id="setting-1" class="text-sm font-medium text-slate-700">プッシュ通知</label>
      <p class="text-sm text-slate-500 mt-1">新しいメッセージの通知を受け取る</p>
    </div>
    <button type="button" role="switch" aria-checked="true" aria-labelledby="setting-1"
      class="relative inline-flex h-6 w-11 items-center rounded-full bg-primary-500 flex-shrink-0
             hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
      <span class="inline-block h-5 w-5 rounded-full bg-white shadow-sm translate-x-[22px] transition-transform"></span>
    </button>
  </div>
  <!-- 項目2 -->
  <div class="flex items-center justify-between py-4">
    <div class="leading-normal">
      <label id="setting-2" class="text-sm font-medium text-slate-700">メール通知</label>
      <p class="text-sm text-slate-500 mt-1">重要な更新をメールで受け取る</p>
    </div>
    <button type="button" role="switch" aria-checked="false" aria-labelledby="setting-2"
      class="relative inline-flex h-6 w-11 items-center rounded-full bg-slate-200 flex-shrink-0
             hover:bg-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
      <span class="inline-block h-5 w-5 rounded-full bg-white shadow-sm translate-x-0.5 transition-transform"></span>
    </button>
  </div>
  <!-- 項目3: Disabled -->
  <div class="flex items-center justify-between py-4">
    <div class="leading-normal">
      <label id="setting-3" class="text-sm font-medium text-slate-500">SMS通知</label>
      <p class="text-sm text-slate-500 mt-1">電話番号の登録が必要です</p>
    </div>
    <button type="button" role="switch" aria-checked="false" aria-labelledby="setting-3"
      aria-disabled="true"
      class="relative inline-flex h-6 w-11 items-center rounded-full bg-slate-100 flex-shrink-0
             opacity-50 cursor-not-allowed">
      <span class="inline-block h-5 w-5 rounded-full bg-white shadow-sm translate-x-0.5"></span>
    </button>
  </div>
</div>
```

### 6-5. Small サイズ

```html
<div class="flex items-center gap-3">
  <button type="button" role="switch" aria-checked="true" aria-label="有効"
    class="relative inline-flex h-5 w-8 items-center rounded-full bg-primary-500
           hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-colors">
    <span class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm translate-x-[14px] transition-transform"></span>
  </button>
  <span class="text-sm text-slate-700">有効</span>
</div>
```
