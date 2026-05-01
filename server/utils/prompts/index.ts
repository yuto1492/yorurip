import type {
  Channel,
  Customer,
  ConversationMemo,
  ConversationThreadMessage,
  GenerateRequest,
  GenerationMode,
  Industry,
  SafetyMode,
  ToneFeatures,
  ToneFeatureSet,
  ToneSample,
  UserProfile,
} from '~/types/domain'
import { PERSONAS } from './personas'
import { CHANNEL_GUIDES } from './channels'
import { MODE_GUIDES } from './modes'
import { ABSOLUTE_RULES, SAFETY_GUIDES } from './safety'

export interface PromptContext {
  profile: UserProfile
  request: GenerateRequest
  customer: Customer | null
  /** 客の登録なし、名前のみ指定された場合の簡易ターゲット名 */
  customerNameOverride?: string | null
  recentMemos: ConversationMemo[]
  toneSamples: ToneSample[]
  /**
   * 「客と会話」スレッドの直近メッセージ(時系列昇順)。
   * 指定された場合のみ「このやりとりの直近」ブロックとして注入される。
   */
  threadMessages?: ConversationThreadMessage[]
}

/**
 * 業種・チャネル・モード・安全モードを束ねた「変わりにくい」システムプロンプト。
 * 将来 prompt caching を入れる時はこの関数の戻り値を cache breakpoint で挟む想定。
 */
export function composeSystemPrompt(ctx: PromptContext): string {
  const industry = ctx.profile.industry as Industry
  const channel = ctx.request.channel as Channel
  const mode = ctx.request.mode as GenerationMode
  const safetyMode = (ctx.profile.safety_mode ?? 'safe') as SafetyMode

  const ngWords = parseNgWords(ctx.profile.ng_words)
  const ngBlock =
    ngWords.length > 0
      ? `[NG語 — 出力に絶対含めない]\n${ngWords.map((w) => `- ${w}`).join('\n')}`
      : '[NG語] (登録なし)'

  return [
    PERSONAS[industry],
    `\n[チャネル別文体ガイド]\n${CHANNEL_GUIDES[channel]}`,
    `\n[モード別指示]\n${MODE_GUIDES[mode]}`,
    `\n${SAFETY_GUIDES[safetyMode]}`,
    `\n${ABSOLUTE_RULES}`,
    `\n${SALES_TONE_GUARD}`,
    `\n${ngBlock}`,
    `\n[出力規則]
- 必ず submit_candidates ツールを1回呼んで3つの候補文面を提出すること。
- 候補3つは互いにトーン・角度を変えること(同じ文を3つにしない)。
- 文末や挨拶のテンプレ感が出ないように、ユーザー口調特徴があればそれに寄せる。
- 会話文中に源氏名・本名・店名等のNG語を一切含めない。
- 会話から客情報を抽出できたなら、追加で propose_customer_update または propose_customer_create を呼んでよい(任意)。`,
  ].join('\n')
}

/**
 * 全業種共通の「営業色のトーン制限」。
 * シャンパン煽りや高額メニュー催促が AI 生成で出すぎると、客に「テンプレ営業」と
 * 見抜かれて関係が冷えるため、ユーザーが明示しない限りは使わせない。
 */
const SALES_TONE_GUARD = `[営業色のトーン制限 — 重要]
- **シャンパン・高額ボトル・シャンパンタワー** などの高額アイテムを「入れて」「飲んで」と直接ねだる/示唆する表現を、ユーザーから明示されていない限り出さない。
  - NG例: 「次会う時シャンパン入れてくれたら嬉しい」「今度はボトル入れようね」(ユーザーが明示してない場合)
  - OK: ユーザーがシーン/今日の出来事に「シャンパン入れてくれた」「シャンパン入れてほしい」と書いている場合だけ言及する。
- 同様に **チェキ・グッズ・指名・同伴・アフター・場内指名** 等の購入/有料行為を勝手に催促しない。
  - これらもユーザーが明示したシーン/出来事にだけ反応する。
- 営業の引きは「**会いたい / 話したい / 顔見たい / 寂しかった / 元気にしてる?**」のような心理的距離ベースを優先。金銭的値踏みのトーンは避ける。
- 「お金落としてくれたら〜」「もっと使ってくれたら〜」のような金額示唆もNG。
- ただし「ユーザーが入れた汎用シーン("出勤告知"等)」だけが指定されていて具体物の指定がない場合は、自然な来店誘導程度に留める(高額品の名指しはしない)。`


/**
 * 「毎リクエストで変わる」ユーザーコンテキスト。
 * 口調特徴・対象客カルテ・直近メモ・モード別の追加情報をまとめる。
 */
export function composeUserPrompt(ctx: PromptContext): string {
  const parts: string[] = []

  // ユーザー本人プロフィール
  const userBlock: string[] = []
  if (ctx.profile.genji_name) userBlock.push(`源氏名: ${ctx.profile.genji_name}`)
  // 口調学習は単一バケットに統一されているため、生成モード/チャネルに関わらず
  // 'dm' に保存された tone_features / tone_samples を常に参照する。
  const toneFeatureBlock = renderToneFeatures(
    ctx.profile.tone_features as ToneFeatures | null,
    'dm' as Channel,
    ctx.toneSamples,
  )
  if (toneFeatureBlock) userBlock.push(toneFeatureBlock)
  if (userBlock.length > 0) {
    parts.push(`[あなた自身のプロフィール]\n${userBlock.join('\n')}`)
  }

  // 対象客(personal/reply/thanks時)
  // 登録済みカルテがあれば全項目、なければ customerNameOverride のみ
  if (ctx.customer) {
    parts.push(`[対象客カルテ]\n${renderCustomer(ctx.customer)}`)
  } else if (ctx.customerNameOverride && ctx.customerNameOverride.trim()) {
    parts.push(
      `[対象客 (簡易・未登録)]\n` +
        `ニックネーム: ${ctx.customerNameOverride.trim()}\n` +
        `(詳細情報なし。名前以外の客個別情報は推測しないこと)`,
    )
  }

  // 直近会話メモ
  if (ctx.recentMemos.length > 0) {
    parts.push(
      `[直近の会話メモ(新しい順)]\n${ctx.recentMemos
        .map((m) => `- ${m.memo_date}: ${m.content}`)
        .join('\n')}`,
    )
  }

  // モード固有の入力
  if (ctx.request.sceneType) {
    // personal モードでは「営業したい内容」というラベルにして意図を明確化
    const sceneLabel = ctx.request.mode === 'personal' ? '営業したい内容' : 'シーン'
    parts.push(`[${sceneLabel}]\n${ctx.request.sceneType}`)
  }
  // スレッド全体の直近メッセージ(客と会話モード時のみ)
  if (ctx.threadMessages && ctx.threadMessages.length > 0) {
    const lines: string[] = ['[このやりとりの直近 (時系列順、最後が最新)]']
    for (const m of ctx.threadMessages) {
      const who = m.direction === 'incoming' ? '客' : '自分'
      lines.push(`- ${who}: ${m.content.replace(/\n/g, ' ')}`)
    }
    lines.push(
      '※ 上記の流れ全体(客の発言も自分の発言も)を踏まえて自然な返信を作る。',
      '※ 自分の過去の発言とも矛盾しないこと: 同じ話題や同じ表現を繰り返さない、口調・呼び方・敬語レベルを揃える。',
      '※ 客の直前のメッセージにある質問や提案を見落とさないこと。',
    )
    parts.push(lines.join('\n'))
  }

  if (ctx.request.incomingMessage) {
    parts.push(`[相手から届いた文面]\n${ctx.request.incomingMessage}`)
  }
  if (ctx.request.todayEvent) {
    parts.push(`[今日の出来事]\n${ctx.request.todayEvent}`)
  }

  // 返信モード時の会話の流れ指示
  if (ctx.request.mode === 'reply') {
    const flow = ctx.request.replyFlow ?? 'continue'
    if (flow === 'cut') {
      parts.push(
        `[会話の流れ]\nこのターンで会話を**自然に区切って終わらせる**方向。\n` +
          `- 次の話題やオープンな質問は振らない。\n` +
          `- 「またね」「お疲れ」「おやすみ」のような区切りで結ぶ。\n` +
          `- 関係性を切るのではなく、次のターンを作らないという意図。`,
      )
    } else {
      parts.push(
        `[会話の流れ]\nこのターンで会話を**続ける**方向。\n` +
          `- 返信の最後に次の話題やオープンな質問を1つ自然に振る。\n` +
          `- 相手が返したくなる軽い振り(質問・近況シェア・誘い水)を入れる。`,
      )
    }
  }

  // 追加で含めたい内容(任意指示)
  if (ctx.request.extraInstructions && ctx.request.extraInstructions.trim()) {
    parts.push(
      `[追加で含めたい内容(優先指示)]\n` +
        ctx.request.extraInstructions.trim() +
        `\n(できるだけ自然に組み込むこと。露骨な貼り付け感を避ける)`,
    )
  }

  if (ctx.request.lengthPreference) {
    parts.push(`[長さの希望]\n${ctx.request.lengthPreference}`)
  }

  // 愛情度: 1=塩(業務的) 〜 10=愛情(親密)
  const affection = clampAffection(ctx.request.affectionLevel)
  parts.push(
    `[愛情度] ${affection}/10 (1=塩・業務的、10=愛情・親密)\n` +
      affectionGuide(affection),
  )

  parts.push('上記を踏まえて、submit_candidates で3案を提出してください。')

  return parts.join('\n\n')
}

// ----- helpers ---------------------------------------

function clampAffection(n: number | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 5
  return Math.max(1, Math.min(10, Math.round(n)))
}

function affectionGuide(level: number): string {
  if (level <= 2) {
    return [
      '- 業務トーン寄り。事務連絡的だが冷たすぎない。',
      '- 「会いたい」「特別」のような感情語は使わない。',
      '- 営業色も弱め。来店誘いは入れても軽く一言だけ。',
      '- 絵文字は0〜1個に抑える。',
    ].join('\n')
  }
  if (level <= 4) {
    return [
      '- やや距離感のある親しみ。普通の店員→客の温度。',
      '- 感情表現は控えめ。「楽しかった」程度の汎用表現に留める。',
      '- 営業誘導は普通の強さ。',
    ].join('\n')
  }
  if (level <= 6) {
    return [
      '- 程よい親しみ。一般的な営業文の温度感。',
      '- 「また会えたら嬉しい」程度の温かさを入れて良い。',
      '- 業種ペルソナの標準的な絵文字密度を保つ。',
    ].join('\n')
  }
  if (level <= 8) {
    return [
      '- 親密寄り。常連・ファンに送る温度。',
      '- 「会いたかった」「またすぐ来てほしい」など特別感を出す。',
      '- 絵文字や記号で気持ちを盛る。',
    ].join('\n')
  }
  // 9-10
  return [
    '- 最大の愛情・特別感。ガチ恋客や太客向けの距離感。',
    '- 「あなただけ」「ずっと考えてた」など強めの感情語OK。',
    '- 甘え・親密表現を積極的に入れる。',
    '- ただし業種ペルソナの口調は崩さない(下品さや過剰な性的表現にはしない)。',
  ].join('\n')
}

function parseNgWords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
}

/**
 * 3 層構造の口調特徴 (PROMPTS.md [5]) を生成プロンプトに注入する形式に整形する。
 * - 層1: 構造的特徴 (StructuralFeatures)
 * - 層2: 方言・キャラ判定 (JudgedFeatures)
 * - 層3: Few-shot サンプル (ExampleSamples) — 最重要
 */
function renderToneFeatures(
  features: ToneFeatures | null,
  channel: Channel,
  samples: ToneSample[],
): string | null {
  const set: ToneFeatureSet | undefined = features?.byChannel?.[channel]

  // 3 層構造の tone_features がある時はそれを使う (新フォーマット必須)
  if (set?.structuralFeatures && set?.judgedFeatures) {
    const blocks: string[] = []
    const sf = set.structuralFeatures
    const jf = set.judgedFeatures

    // 層1: 構造的特徴
    blocks.push(
      [
        '[口調の構造的特徴]',
        `- 平均文長: ${sf.avgLength} 字`,
        `- 1メッセージの平均文数: ${sf.avgSentencePerMessage}`,
        `- 絵文字密度: ${sf.emojiDensity} (${sf.emojiDensityNote})`,
        `- 改行スタイル: ${sf.lineBreakStyle}`,
        `- 頻出語尾: ${sf.frequentEndings.join(' / ')}`,
        `- 頻出絵文字: ${sf.frequentEmojis.join(' / ')}`,
        `- 頻出記号: ${sf.frequentPunctuation.join(' / ')}`,
        `- 一人称: ${sf.firstPerson}`,
      ].join('\n'),
    )

    // 層2: 方言・キャラ判定
    blocks.push(
      [
        '[口調の判定特徴]',
        `- 方言: ${jf.dialect} (適用度: ${jf.dialectIntensity})`,
        jf.dialectExamples.length > 0
          ? `  - 方言例: ${jf.dialectExamples.join(' / ')}`
          : null,
        `- キャラ: ${jf.characterStyle} — ${jf.characterStyleNote}`,
        `- 文体ベース: ${jf.speechBase}`,
        `- 顧客への呼称傾向: ${jf.callPattern}`,
        `- 特徴的な癖:`,
        ...jf.characteristicPhrases.map((p) => `  - ${p}`),
      ]
        .filter((l): l is string => l !== null)
        .join('\n'),
    )

    // 層3: Few-shot サンプル (最優先で真似させる)
    if (set.exampleSamples && set.exampleSamples.length > 0) {
      const exLines: string[] = [
        '[ユーザーの過去の文面例]',
        'これらはユーザーが実際に書いた文面である。',
        '文体・語彙・絵文字使い・方言の混ぜ方を真似て生成すること。',
        '',
      ]
      set.exampleSamples.forEach((ex, i) => {
        exLines.push(`例${i + 1} (${ex.contextLabel}):`)
        exLines.push('"""')
        exLines.push(ex.text)
        exLines.push('"""')
        exLines.push('')
      })
      exLines.push(
        '[口調再現の優先順位]',
        '1. 上の過去文面例から直接パターンを学んで真似る (最優先)',
        '2. 上の判定特徴 (方言/キャラ等) を踏まえる',
        '3. 上の構造的特徴 (文長/絵文字密度等) を満たす',
        '4. 業種ペルソナの一般的傾向 (最も低優先・矛盾時はユーザー口調を優先)',
        '',
        '[サンプルから過剰に拡張しない注意]',
        '- サンプルにない造語・方言を勝手に追加しない',
        '- サンプルにない引用癖を別文脈に流用しない',
        '- 不確実な場合は標準寄りに倒す',
      )
      blocks.push(exLines.join('\n'))
    }

    return blocks.join('\n\n')
  }

  // 抽出前なら、最近のサンプルを生でモデルに渡してフェイクな反映を期待する
  const recent = samples.slice(0, 3)
  if (recent.length === 0) return null
  const lines: string[] = ['[最近のあなたの文面サンプル(口調を寄せる参考)]']
  recent.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.content}`)
  })
  return lines.join('\n')
}

// customer_type のリテラル → 人間可読ラベルとプロンプト指示
const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  futo: '太客',
  ita: '痛客',
  mame: 'マメ客',
  shio: '塩客',
  oshi_gachi: '推しガチ勢',
  oshi_enjoy: '推しエンジョイ勢',
  other_oshi: '他キャスト推し(自分は二番手以下)',
  kake_mochi: '掛け持ち(自分含む複数キャストを推し)',
  peer_cast: '同業キャスト',
}

const CUSTOMER_TYPE_PROMPT_HINT: Record<string, string> = {
  other_oshi:
    '注意: 本命は別キャスト。自分はサブ扱い。感情を押し付けず、相手の本命キャストを尊重するトーン。「ついでに会えて嬉しい」程度の距離感。',
  kake_mochi:
    '注意: 自分も含めて複数キャストを掛け持ちで推している客。独占欲を出さず、他キャストへの嫉妬を匂わせない。',
  peer_cast: [
    '⚠️ 重要: この相手は客ではなく**同業キャスト**(別店舗 or 同店舗の同業者)。',
    '営業色を一切出さない。来店誘導・チェキ営業・指名促しなど業務トーンを封じる。',
    '「ついでに会えて嬉しかった」「お疲れ様」「また遊ぼう」のような同業者間のフラットな挨拶/同志トーンで書く。',
    '相手がここに来た主目的は別キャスト(◯◯ちゃん)に会うため、という前提で、自分との接点は副次的なものとして扱う。',
    '愛情度パラメータがどれだけ高くても、恋愛的な甘え・親密表現は使わない。',
  ].join('\n'),
}

function renderCustomer(c: Customer): string {
  const lines: string[] = []

  // peer_cast は最初に強い注意書きを出す
  if (c.customer_type && CUSTOMER_TYPE_PROMPT_HINT[c.customer_type]) {
    lines.push(CUSTOMER_TYPE_PROMPT_HINT[c.customer_type])
    lines.push('---')
  }

  lines.push(`ニックネーム: ${c.nickname}`)
  if (typeof c.age === 'number') lines.push(`年齢: ${c.age}`)
  if (c.occupation) lines.push(`職業: ${c.occupation}`)
  if (c.customer_type) {
    const label = CUSTOMER_TYPE_LABEL[c.customer_type] ?? c.customer_type
    lines.push(`タイプ: ${label}`)
  }
  if (typeof c.relation_score === 'number') lines.push(`関係性スコア: ${c.relation_score}/5`)
  if (c.ng_time) lines.push(`NG時間帯: ${c.ng_time}`)
  if (c.last_visit_at) lines.push(`最終来店: ${c.last_visit_at}`)

  // コンカフェ拡張
  if (typeof c.cheki_count === 'number' && c.cheki_count > 0)
    lines.push(`チェキ枚数: ${c.cheki_count}`)
  if (c.oshi_rank) lines.push(`推しランク: ${c.oshi_rank}`)
  if (Array.isArray(c.goods_owned) && c.goods_owned.length > 0)
    lines.push(`所有グッズ: ${(c.goods_owned as string[]).join(' / ')}`)

  if (c.preferences && typeof c.preferences === 'object') {
    const prefEntries = Object.entries(c.preferences as Record<string, unknown>).filter(
      ([, v]) => v !== null && v !== '' && v !== undefined,
    )
    if (prefEntries.length > 0) {
      lines.push(
        `好み: ${prefEntries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}`,
      )
    }
  }

  return lines.join('\n')
}
