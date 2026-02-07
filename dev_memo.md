# はじめに
- 本ドキュメントは、自作Obsidian Plugin`genimage-inserter`の仕様及び開発管理を行うことを目的としています。
- 本リポはObsidian plugin sampleの公式リポをテンプレートとしています。
  - https://github.com/obsidianmd/obsidian-sample-plugin

# 要件
## ユーザーニーズ
- 編集中のObsidianノートの文章の一部もしくは全部をコンテキストに生成AIの画像生成機能を使った画像を生成したい。
- 生成した画像を保存と編集中のノートにインサートしたい。

## 想定ユーザーフロー
### 一部対象文章
1. ノートを編集している。
2. ノートの一部文章をビジュアル的に表現したいと欲する。
3. 対象文章の範囲を選択する。
4. 右クリックし、`Generate image` を右クリックメニューから選択する。
5. **プロンプト選択モーダルが表示される。**
6. **使用するプロンプトファイルを選択する。**
7. 処理が走り一定時間後、{notefilename}/ が作成されその下に生成された画像が保存される。
8. 選択範囲の末尾が改行され、生成画像が挿入される。

### ノート全文
1. ノートを開く
2. 文章を選択していない状態で右クリックし、`Generate image` を右クリックメニューから選択する。
3. **プロンプト選択モーダルが表示される。**
4. **使用するプロンプトファイルを選択する。**
5. 処理が走り一定時間後、{notefilename}/ が作成されその下に生成された画像が保存される。
6. ノートの末尾が改行され、生成画像が挿入される。

## 実装仕様概要
- 利用AI providerはGeminiとする。
- 生成モデルはモデル名で指定する。
- モデル名およびAPI Keyは**Vault外のディレクトリ**にユーザーが `.env` を配置し参照する。
- 生成画像のファイル名は `{yyyymmddhhmmss_<notename>}<ext>` とする。
  - 拡張子はAPIレスポンスのMIMEタイプから動的に決定する。
- 生成処理は複数同時に走らないものとし、同時に要求が来た場合rejectする。
- API Keyはログ等に露出しないことを厳とする。
- 動作ログを `.obsidian/plugins/genimage-inserter/genimage-inserter.log` に保存する。
- エラー発生時はObsidianのNotification機能でユーザーに通知する。

### プロンプトファイル仕様
- 設定で指定したディレクトリ内の `.md` ファイルをプロンプトファイルとして認識する。
- ユーザーは複数のプロンプトファイルを用意し、用途に応じて選択できる。
- プロンプトファイルはシステムプロンプトとして使用され、ユーザーが選択したテキストと組み合わせてAPIに送信される。
- プロンプトファイルのYAMLフロントマターで画像生成パラメータを指定可能。

#### フロントマター仕様
```yaml
---
aspect_ratio: "16:9"  # アスペクト比（省略時: 1:1）
image_size: "2K"      # 画質（省略時: 1K）
---
```

| パラメータ | 有効値 | デフォルト |
|-----------|--------|-----------|
| `aspect_ratio` | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` | `1:1` |
| `image_size` | `1K`, `2K`, `4K` | `1K` |

- フロントマターがない場合、または無効な値の場合はデフォルト値を使用する。
- 無効な値が指定された場合は警告ログを出力する。

#### プロンプトファイル例
**イラスト風（横長）: `illustration_wide.md`**
```markdown
---
aspect_ratio: "16:9"
image_size: "2K"
---
あなたはイラストレーターです。以下の文章を美しいイラストとして表現してください。
色彩豊かで、温かみのあるタッチで描いてください。
```

**写実的（正方形）: `realistic.md`**
```markdown
---
aspect_ratio: "1:1"
image_size: "2K"
---
以下の文章をフォトリアリスティックな画像として生成してください。
自然な照明と構図を心がけてください。
```

**シンプル（フロントマターなし）: `simple.md`**
```markdown
以下の文章を画像化してください。
```

## 設定項目
- `.env` のPATH
  - Vault外であることが必須
- プロンプトファイル格納ディレクトリのPATH
  - このディレクトリ内の `.md` ファイルがプロンプト選択モーダルに表示される

## .env sample
```
LLM_PROVIDER=gemini # 将来的な他プロバイダ対応の場合に備えて
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash-image
```

# Reference
## Gemini API Document
- https://ai.google.dev/gemini-api/docs/image-generation?hl=ja

## Gemini 画像生成 API 概要

### 利用可能なモデル
| モデル名 | 説明 |
|----------|------|
| `gemini-2.5-flash-image` | 速度と効率性を重視。大量の低レイテンシタスク向け。 |
| `gemini-3-pro-image-preview` | 高度な推論で複雑な指示に対応。高品質テキストレンダリング対応。 |

### API リクエスト形式（REST）
```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {"text": "プロンプトテキスト"}
      ]
    }],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"],
      "imageConfig": {
        "aspectRatio": "1:1",
        "imageSize": "1K"
      }
    }
  }'
```

### レスポンス形式
- レスポンスの `parts` 配列に `text` または `inlineData` が含まれる。
- `inlineData` には以下が含まれる:
  - `mimeType`: 画像のMIMEタイプ（例: `image/png`, `image/jpeg`）
  - `data`: Base64エンコードされた画像データ

### 画質設定（imageConfig）
| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `imageSize` | `1K`, `2K`, `4K` | 出力画像の解像度 |
| `aspectRatio` | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` | アスペクト比 |

### 注意事項
- 全ての生成画像には SynthID の透かしが埋め込まれる。
- `responseModalities` に `IMAGE` を含める必要がある。