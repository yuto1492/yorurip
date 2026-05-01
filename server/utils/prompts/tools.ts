import type Anthropic from '@anthropic-ai/sdk'

/**
 * Claude API へ渡す Tool 定義。
 *
 * - submit_candidates: 必ず1回呼ばせる(tool_choice: any + system promptで指示)。
 *   3案を構造化出力させるための公式I/O。
 * - propose_customer_create / propose_customer_update: 任意。
 *   会話から客情報を抽出できた時のみ呼ばれる。
 *   フロント側で承認カードに変換され、ユーザータップで初めてDB書き込み。
 */
export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'submit_candidates',
    description:
      '生成した3つの返信文候補を提出する。必ずこのツールを1回呼ぶこと。' +
      '3案は互いに微妙にトーンや角度を変える(丁寧寄り / 普通 / フレンドリー寄り 等)。',
    input_schema: {
      type: 'object',
      properties: {
        candidates: {
          type: 'array',
          description: '生成した文面の候補。必ず3つ。',
          items: { type: 'string' },
          minItems: 3,
          maxItems: 3,
        },
      },
      required: ['candidates'],
    },
  },
  {
    name: 'propose_customer_update',
    description:
      '会話の文脈から既存客の追加情報を抽出できた場合に呼ぶ。' +
      'ユーザーが承認カードで承認するまでDBには反映されない。確実に分かった項目だけ埋める。',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: {
          type: 'string',
          description: '既存客のID(personalモードで対象客が居るときのみ)。',
        },
        nickname: { type: 'string', description: 'ニックネーム(変更があれば)。' },
        preferences: {
          type: 'object',
          description: '客の好み(喫煙/酒/シャンパン/食べ物等のkey-value)。',
          additionalProperties: true,
        },
        occupation: { type: 'string' },
        memo: {
          type: 'string',
          description: '会話メモ。次回以降の生成プロンプトに利用される。',
        },
        ng_time: { type: 'string', description: '連絡を避けるべき時間帯(例: 平日朝)。' },
        cheki_count: { type: 'integer', description: 'チェキ累計枚数(コンカフェ)。' },
        oshi_rank: { type: 'string', description: '推しランク(コンカフェ)。' },
        goods_owned: {
          type: 'array',
          items: { type: 'string' },
          description: '所有グッズ一覧(コンカフェ)。',
        },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'propose_customer_create',
    description:
      '相手の文面から、まだカルテに無い新規客を発見した時に呼ぶ。' +
      'ニックネームが特定できることが必須条件。',
    input_schema: {
      type: 'object',
      properties: {
        nickname: { type: 'string', description: 'ニックネームまたは呼称。' },
        preferences: {
          type: 'object',
          additionalProperties: true,
        },
        occupation: { type: 'string' },
        memo: { type: 'string' },
        cheki_count: { type: 'integer' },
        oshi_rank: { type: 'string' },
        goods_owned: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['nickname'],
    },
  },
]
