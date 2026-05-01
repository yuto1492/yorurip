/**
 * 口調分析プロンプト ([10] / Opus 4.7 専用)。
 *
 * `/api/tone/analyze` から呼ばれる。3 層構造の tone_features を抽出し、
 * 厳格な JSON スキーマで返す。空配列・空文字を返す「諦め」は許されない方針。
 *
 * 設計: PROMPTS.md [10-A] [10-B] [10-C] [10-D] を参照。
 */

// =============================================================================
// [10-A] 分析用システムプロンプト
// =============================================================================

export const TONE_ANALYSIS_SYSTEM_PROMPT = `あなたは日本語のチャット文体を分析する専門家です。
夜職・接客業(コンカフェ/キャバ/ホスト/風俗等)のキャストが顧客に送った実際のメッセージから、
そのキャスト固有の文体特徴を抽出して構造化JSONで返してください。

## 抽出の基本方針
- 一般的な日本語の特徴ではなく、**このキャスト「らしさ」の特徴**を抽出する
- 「絵文字を使う」ではなく「絵文字を**どう**使うか」「どの絵文字を好むか」を捉える
- 数値(密度・文長)は実際のテキストから計算する。0や空配列を勝手に返さない
- 個性的な癖(独特の感嘆符の連打、繰り返し癖、いじり名、関西弁混ぜ、擬音語、独自の挨拶等)を**必ず** characteristicPhrases に含める
- 抽出に迷ったら、業種ペルソナに引きずられず**サンプルに即して判断**する

## ノイズ除外
以下はキャストの口調ではなくノイズなので、抽出時に無視する:
- 末尾の意味不明な数字や記号(「12」「あ」単独「w」等)
- 明らかな書き間違い・誤変換
- URL・電話番号・メールアドレス
- ハッシュタグ単独 (# のみ)

## サンプルからの Few-shot 選別
入力サンプルの中から、「このキャストらしさを最もよく示す3〜5本」を選んで exampleSamples に格納する。
選別基準 (優先順位順):
1. キャストの個性的な癖 (いじり名・擬音語・独特な強調・関西弁等) が最も濃く出ているもの
2. 異なる文脈バリエーション (来店お礼/告知/雑談/返信 等) を網羅
3. 長すぎず短すぎず (平均文長±50%程度)
4. ノイズや個人情報を含まない

## 必須出力スキーマ (厳守、欠けたフィールドがあるとシステムエラー)

{
  "structuralFeatures": {
    "avgLength": <number, サンプル平均の合計文字数 (改行含む)>,
    "avgSentencePerMessage": <number, 1メッセージあたりの平均文数>,
    "emojiDensity": "low" | "medium" | "high",
    "emojiDensityNote": "<なぜそう判定したかの一言>",
    "lineBreakStyle": "minimal" | "moderate" | "frequent",
    "frequentEndings": [<string>, ...],   // 必ず3個以上、語尾を実例で
    "frequentEmojis": [<string>, ...],    // 使われている絵文字を頻度順、絵文字なしなら ["(絵文字なし)"]
    "frequentPunctuation": [<string>, ...], // 「!!」「!!!」「‼️」「〜〜〜」等の特徴的記号
    "firstPerson": "<string or '不使用'>"
  },
  "judgedFeatures": {
    "dialect": "standard" | "kansai" | "hakata" | "okinawa" | "mixed" | "unknown",
    "dialectIntensity": "none" | "light" | "moderate" | "heavy",
    "dialectExamples": [<string>, ...],   // 方言と判定した根拠の語句
    "characterStyle": "sweet" | "cool" | "big_sister" | "natural" | "gal" | "mature" | "other",
    "characterStyleNote": "<キャラ判定の根拠を一言>",
    "speechBase": "polite" | "casual" | "mixed",
    "callPattern": "<顧客への呼称傾向、例: ○○ご主人様 / ○○さん+いじり名 / ○○ちゃん 等>",
    "characteristicPhrases": [<string>, ...]   // 必ず3個以上、このキャスト独自の癖を実例で
  },
  "exampleSamples": [
    {
      "text": "<サンプル原文をそのまま>",
      "contextLabel": "<お礼/告知/返信/雑談 等の分類>",
      "channel": "<line/x_dm/ig_dm/x_post>",
      "characteristicReason": "<このサンプルを選んだ理由を一言>"
    }
  ],   // 3〜5本
  "lastAnalyzedAt": "<ISO8601形式の現在時刻>"
}

出力は説明文・前置き・コードフェンス一切なしで、JSON1つのみ。`

// =============================================================================
// [10-B] Few-shot 出力例
// =============================================================================
// 期待される精度を Opus 4.7 に明示するため、入力 + 出力ペアを 1 件丸ごと埋め込む

export const TONE_ANALYSIS_FEW_SHOT_INPUT = `[サンプル1] (line / manual)
ゆっさん!さん!さんたくろーす!
今日、仕事終わったらって言うてたのに、
残してまで来てくれてありがとう😭
本当に感謝!!
シャンパンまで少ない時間で感謝です!
ありがとう!!優しすぎました!
ドリンクもご馳走様!!!
ゆっくりまた話そう😭

[サンプル2] (line / manual)
15日は久しぶりにリラックス?
おめでとう!!!来てくれてありがとう!
ドルインクもミニシャンパンも感謝!
仕事付けお疲れ様!!!!!!
体壊さん程度に頑張れええ
チェキは待っててねー!!!

[サンプル3] (line / manual)
昨日はありがとう!
でんちゃんわんさかわんさかで
よかった!!
でんちゃんを拾ってくれてありがとう!
後ろに座らせてすまん!
ドリンクご馳走様でした!!
でんちゃん辞めたこと実感するのはイツカナ

[サンプル4] (line / manual)
昨日来てくれて
てんきゅーてんきゅーべりまっちょ!
ドリンクご馳走様!!

[サンプル5] (line / manual)
昨日はクリスマスぶりに会えてよかった!
しかも早めの来店ありがとう!!
ドリンクご馳走様!
延長も感謝!
改めて今年もよろしくよー!`

export const TONE_ANALYSIS_FEW_SHOT_OUTPUT = `{
  "structuralFeatures": {
    "avgLength": 95,
    "avgSentencePerMessage": 5.2,
    "emojiDensity": "low",
    "emojiDensityNote": "サンプル5本中2本で😭が使われている程度。装飾的な絵文字は少なく、感嘆符での感情表現が中心",
    "lineBreakStyle": "frequent",
    "frequentEndings": ["〜!", "〜よ", "〜ね", "〜よー", "感謝", "ご馳走様"],
    "frequentEmojis": ["😭"],
    "frequentPunctuation": ["!!", "!!!", "!!!!!!", "〜"],
    "firstPerson": "不使用"
  },
  "judgedFeatures": {
    "dialect": "kansai",
    "dialectIntensity": "light",
    "dialectExamples": ["言うてた", "壊さん", "すまん"],
    "characterStyle": "big_sister",
    "characterStyleNote": "サバサバした男前系。「すまん」「頑張れええ」のような姉御肌、「体壊さん程度に」と気遣いも見せる",
    "speechBase": "casual",
    "callPattern": "客の名前を遊び倒す癖あり(「ゆっさん!さん!さんたくろーす!」「ゆうさんさんさんゆっさんさん」型のいじり名)",
    "characteristicPhrases": [
      "感嘆符を狂ったように連打する(!!!!!!)",
      "客の名前を時期や気分で遊んで呼ぶ(クリスマス時期は「さんたくろーす」化)",
      "独自の擬音語・造語(「でんちゃんわんさかわんさか」「てんきゅーてんきゅーべりまっちょ」)",
      "ご馳走様!の連呼(ドリンク/シャンパンへの定型感謝)",
      "「〜よー」「〜ね」のフランクな語尾",
      "命令形での親しみ表現(「頑張れええ」「待っててねー」)",
      "関西弁ライト混ぜ(「言うてた」「すまん」「壊さん程度に」)"
    ]
  },
  "exampleSamples": [
    {
      "text": "ゆっさん!さん!さんたくろーす!\\n今日、仕事終わったらって言うてたのに、\\n残してまで来てくれてありがとう😭\\n本当に感謝!!\\nシャンパンまで少ない時間で感謝です!\\nありがとう!!優しすぎました!\\nドリンクもご馳走様!!!\\nゆっくりまた話そう😭",
      "contextLabel": "お礼",
      "channel": "line",
      "characteristicReason": "いじり名+関西弁+感嘆符連打+ご馳走様、このキャストの個性が全部入っている"
    },
    {
      "text": "昨日来てくれて\\nてんきゅーてんきゅーべりまっちょ!\\nドリンクご馳走様!!",
      "contextLabel": "お礼",
      "channel": "line",
      "characteristicReason": "短文+独自の造語擬音、テンション系の典型"
    },
    {
      "text": "15日は久しぶりにリラックス?\\nおめでとう!!!来てくれてありがとう!\\nドルインクもミニシャンパンも感謝!\\n仕事付けお疲れ様!!!!!!\\n体壊さん程度に頑張れええ\\nチェキは待っててねー!!!",
      "contextLabel": "お礼",
      "channel": "line",
      "characteristicReason": "感嘆符6連打、関西弁ライト、姉御的な気遣い表現"
    },
    {
      "text": "昨日はありがとう!\\nでんちゃんわんさかわんさかで\\nよかった!!\\nでんちゃんを拾ってくれてありがとう!\\n後ろに座らせてすまん!\\nドリンクご馳走様でした!!\\nでんちゃん辞めたこと実感するのはイツカナ",
      "contextLabel": "お礼",
      "channel": "line",
      "characteristicReason": "独自の擬音語「わんさかわんさか」、関西弁「すまん」、長めの状況描写型"
    }
  ],
  "lastAnalyzedAt": "2026-05-01T05:40:00.000Z"
}`

// =============================================================================
// [10-C] ユーザープロンプト (動的構築)
// =============================================================================

export interface ToneAnalysisInput {
  industry: string
  /** チャネル別の件数集計 (例: "line: 5, x_post: 2") */
  channelDistribution?: string
  samples: { channel: string; source: string; content: string }[]
}

export function buildToneAnalysisUserPrompt(input: ToneAnalysisInput): string {
  const samplesText = input.samples
    .map(
      (s, i) =>
        `[サンプル${i + 1}] (${s.channel} / ${s.source})\n${s.content.trim()}`,
    )
    .join('\n\n')

  return `以下は接客業キャストの過去メッセージサンプルです。
業種: ${input.industry}
${input.channelDistribution ? `チャネル分布: ${input.channelDistribution}` : ''}

## サンプル
${samplesText}

上記スキーマに従って、このキャスト固有の文体特徴を JSON 1 つで返してください。
ノイズは除外し、個性的な癖は必ず characteristicPhrases に含めてください。
出力は説明文・前置き一切なしで、JSON 1 つのみ。`
}

/**
 * Few-shot 用のユーザープロンプト (上記 [10-B] の入力部分を再現したテキスト)。
 * Anthropic に渡す messages 配列で `assistant` ロールの few-shot 出力と組み合わせて使う。
 */
export const TONE_ANALYSIS_FEW_SHOT_USER_PROMPT = `以下は接客業キャストの過去メッセージサンプルです。
業種: コンカフェ
チャネル分布: line: 5

## サンプル
${TONE_ANALYSIS_FEW_SHOT_INPUT}

上記スキーマに従って、このキャスト固有の文体特徴を JSON 1 つで返してください。
ノイズは除外し、個性的な癖は必ず characteristicPhrases に含めてください。
出力は説明文・前置き一切なしで、JSON 1 つのみ。`
