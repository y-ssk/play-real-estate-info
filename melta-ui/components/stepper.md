# Stepper

> マルチステッププロセスの進捗を視覚化するコンポーネント仕様。
> Tailwind CSS 4

---

## 1. 原則

- **プロセス可視化**: ユーザーが全体のステップ数と現在位置を常に把握できる
- **3状態の明確な区分**: Completed / Active / Upcoming を色・アイコン・ボーダーの組み合わせで区別する（色だけに頼らない）
- **クリック不可が基本**: Stepper はナビゲーションではなく進捗表示。ステップ間の移動はフォーム内のボタンで制御する
- **コンパクト表示対応**: 狭いスペースではラベル省略・小サイズ Indicator で対応

---

## 2. 解剖

```
水平:
  [✓]───────[2]───────[3]
 Step 1    Step 2    Step 3
 完了      進行中     未着手

垂直:
  [✓] Step 1 — 完了
   |  説明テキスト
  [2] Step 2 — 進行中
   |  説明テキスト
  [3] Step 3 — 未着手
     説明テキスト
```

| パーツ | 役割 | 必須 |
|--------|------|------|
| Container | Stepper 全体を囲むラッパー | Yes |
| Step | 個々のステップ（Indicator + Label） | Yes |
| Indicator | 状態を示す円形アイコン（番号 / チェック） | Yes |
| Label | ステップの名称 | Yes |
| Description | ステップの補足説明 | No |
| Connector | ステップ間の接続線 | Yes（最後のステップ除く） |

---

## 3. パターン

### 3-1. 状態

| 状態 | 説明 | 視覚表現 |
|------|------|----------|
| Completed | 完了済み | `bg-primary-500 text-white` + Check アイコン |
| Active | 現在のステップ | `border-2 border-primary-500 bg-white text-primary-500` + 番号 |
| Upcoming | 未着手 | `bg-slate-100 text-slate-500` + 番号 |

### 3-2. 方向

| 方向 | 説明 | 用途 |
|------|------|------|
| 水平（デフォルト） | ステップを横に並べる | ウィザード、チェックアウト |
| 垂直 | ステップを縦に並べる | サイドバー内、長い説明付き |

### 3-3. バリエーション

| バリエーション | 説明 | 用途 |
|---------------|------|------|
| ラベルのみ | Indicator + Label | 標準的なステップ表示 |
| ラベル + 説明 | Indicator + Label + Description | 各ステップの詳細が必要な場合 |
| コンパクト | `w-6 h-6` Indicator、ラベル省略可 | 狭いスペース |

---

## 4. 振る舞い

### 4-1. Indicator

```
標準サイズ     : w-8 h-8 rounded-full inline-flex items-center justify-center text-sm flex-shrink-0
コンパクト     : w-6 h-6 rounded-full inline-flex items-center justify-center text-xs flex-shrink-0

Completed      : bg-primary-500 text-white
Active         : border-2 border-primary-500 bg-white text-primary-500 font-semibold
Upcoming       : bg-slate-100 text-slate-500 font-medium
```

### 4-2. Connector

```
水平 Completed : flex-1 h-0.5 mx-3 bg-primary-500
水平 Upcoming  : flex-1 h-0.5 mx-3 bg-slate-200
垂直 Completed : w-0.5 flex-1 my-1 bg-primary-500（Indicator の中央に配置）
垂直 Upcoming  : w-0.5 flex-1 my-1 bg-slate-200
```

### 4-3. Label / Description

```
Completed Label    : text-sm font-medium text-slate-900
Active Label       : text-sm font-semibold text-primary-500
Upcoming Label     : text-sm font-medium text-slate-500

Description        : text-xs text-slate-500 mt-0.5
```

### 4-4. Check アイコン（Completed Indicator 内）

```
SVG : w-4 h-4 fill="none" stroke="currentColor" stroke-width="2"
Path: M5 13l4 4L19 7（stroke-linecap="round" stroke-linejoin="round"）
```

---

## 5. アクセシビリティ

| 項目 | 要件 |
|------|------|
| Container | `role="list"` を付与 |
| Step | `role="listitem"` を付与 |
| Active ステップ | `aria-current="step"` を付与 |
| Check アイコン | `aria-hidden="true"` を付与（装飾的） |
| Completed テキスト | Indicator 内に `<span class="sr-only">完了:</span>` を追加 |

### 禁止事項

> 共通: `foundations/prohibited.md`「ステッパー」参照

- 色だけでステップ状態を区別すること（アイコン + ボーダー + 背景を併用する）
- `aria-current="step"` を Active ステップに付与しないこと
- Indicator サイズを `w-6 h-6` 未満にすること

---

## 6. Tailwind サンプル

### 6-1. 水平（3ステップ、Step 2 Active）

```html
<div role="list" class="flex items-center">
  <!-- Step 1: Completed -->
  <div role="listitem" class="flex items-center">
    <div class="flex flex-col items-center">
      <div class="w-8 h-8 rounded-full bg-primary-500 text-white inline-flex items-center justify-center text-sm flex-shrink-0">
        <span class="sr-only">完了:</span>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <span class="text-sm font-medium text-slate-900 mt-2">アカウント</span>
    </div>
  </div>
  <!-- Connector: Completed -->
  <div class="flex-1 h-0.5 mx-3 bg-primary-500 -mt-6"></div>
  <!-- Step 2: Active -->
  <div role="listitem" class="flex items-center">
    <div class="flex flex-col items-center">
      <div class="w-8 h-8 rounded-full border-2 border-primary-500 bg-white text-primary-500 font-semibold inline-flex items-center justify-center text-sm flex-shrink-0" aria-current="step">
        2
      </div>
      <span class="text-sm font-semibold text-primary-500 mt-2">プロフィール</span>
    </div>
  </div>
  <!-- Connector: Upcoming -->
  <div class="flex-1 h-0.5 mx-3 bg-slate-200 -mt-6"></div>
  <!-- Step 3: Upcoming -->
  <div role="listitem" class="flex items-center">
    <div class="flex flex-col items-center">
      <div class="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-medium inline-flex items-center justify-center text-sm flex-shrink-0">
        3
      </div>
      <span class="text-sm font-medium text-slate-500 mt-2">確認</span>
    </div>
  </div>
</div>
```

### 6-2. 垂直（ラベル + 説明付き）

```html
<div role="list" class="space-y-0">
  <!-- Step 1: Completed -->
  <div role="listitem" class="flex gap-4">
    <div class="flex flex-col items-center">
      <div class="w-8 h-8 rounded-full bg-primary-500 text-white inline-flex items-center justify-center text-sm flex-shrink-0">
        <span class="sr-only">完了:</span>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <div class="w-0.5 flex-1 my-1 bg-primary-500"></div>
    </div>
    <div class="pb-6">
      <p class="text-sm font-medium text-slate-900">アカウント作成</p>
      <p class="text-xs text-slate-500 mt-0.5">メールアドレスとパスワードを設定しました</p>
    </div>
  </div>

  <!-- Step 2: Active -->
  <div role="listitem" class="flex gap-4">
    <div class="flex flex-col items-center">
      <div class="w-8 h-8 rounded-full border-2 border-primary-500 bg-white text-primary-500 font-semibold inline-flex items-center justify-center text-sm flex-shrink-0" aria-current="step">
        2
      </div>
      <div class="w-0.5 flex-1 my-1 bg-slate-200"></div>
    </div>
    <div class="pb-6">
      <p class="text-sm font-semibold text-primary-500">プロフィール設定</p>
      <p class="text-xs text-slate-500 mt-0.5">名前とアバターを設定してください</p>
    </div>
  </div>

  <!-- Step 3: Upcoming -->
  <div role="listitem" class="flex gap-4">
    <div class="flex flex-col items-center">
      <div class="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-medium inline-flex items-center justify-center text-sm flex-shrink-0">
        3
      </div>
    </div>
    <div>
      <p class="text-sm font-medium text-slate-500">完了</p>
      <p class="text-xs text-slate-500 mt-0.5">設定内容を確認して完了します</p>
    </div>
  </div>
</div>
```
