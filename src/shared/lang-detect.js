// Script-based source-language detection for the 'auto' source setting.
//
// Baberu reads Japanese, English, and both Chineses with a single model, so
// detection runs on the OCR'd text — no extra model or download. Heuristics:
//   hiragana/katakana present -> Japanese (kana never appears in Chinese)
//   hangul present -> Korean (unsupported: treated as undetectable)
//   CJK ideographs -> Chinese; Simplified vs Traditional by a vote over
//     common distinctive characters (国/國, 语/語, …). Short texts with no
//     distinctive chars are genuinely ambiguous -> null.
//   Latin letters only -> English
// detectPageLang takes a majority vote across blocks; ties -> null (the
// caller falls back to Japanese, the old default).

const KANA_RE = /[぀-ヿㇰ-ㇿ]/;
const HANGUL_RE = /[가-힯]/;
const CJK_RE = /[一-鿿]/;
const LATIN_RE = /[A-Za-z]/;

// Common characters that only exist in one variant. Kept short on purpose —
// this is a vote, not a dictionary; manga dialogue is full of these.
const SIMP_ONLY = '国语学们汉发对时实让认识这进远运门问间现义为龙龟凤华万与专业东丝买乱争云产亲计议点热爱车丽书卖头坏环还会获机鸡积极际继价艰舰阶节洁结紧锦尽惊镜纠旧举剧据卷开颗夸块怀汇伙划娇骄搅轿较秸借仅谨么亿从达带单当党导灯敌递淀电动斗独读吨夺堕儿叶忆异阴饮隐应营赢拥优忧邮犹游诱于余逾鱼渔娱屿语郁吁愈欲狱誉预驭鸳渊辕园员圆缘愿约跃钥岳粤悦阅郧匀陨蕴酝晕韵杂灾载攒暂赞赃凿枣责择则泽贼赠扎轧闸栅诈斋债毡粘盏斩辗崭栈占战绽张涨帐账胀赵蛰辙锗贞针侦诊镇阵挣睁征狰帧郑证织职执只纸志掷致帜制质滞钟终种肿众轴皱昼骤猪诸诛烛瞩嘱贮驻砖转赚桩庄装妆壮状锥赘坠缀谆准浊兹咨资渍踪骤综总纵邹诅组钻说话听讲讨论译记';
const TRAD_ONLY = '國語學們漢發對時實讓認識這進遠運門問間現義為龍龜鳳華萬與專業東絲買亂爭雲產親計議點熱愛車麗書賣頭壞環還會獲機雞積極際繼價艱艦階節潔結緊錦盡驚鏡糾舊舉劇據捲開顆誇塊懷匯夥劃嬌驕攪轎較稭藉僅謹麼億從達帶單當黨導燈敵遞澱電動鬥獨讀噸奪墮兒葉憶異陰飲隱應營贏擁優憂郵猶遊誘於餘踰魚漁娛嶼語鬱籲癒慾獄譽預馭鴛淵轅園員圓緣願約躍鑰嶽粵悅閱鄖勻隕蘊醞暈韻雜災載攢暫贊贓鑿棗責擇則澤賊贈紮軋閘柵詐齋債氈黏盞斬輾嶄棧佔戰綻張漲帳賬脹趙蟄轍鍺貞針偵診鎮陣掙睜徵猙幀鄭證織職執隻紙誌擲緻幟製質滯鐘終種腫眾軸皺晝驟豬諸誅燭矚囑貯駐磚轉賺樁莊裝妝壯狀錐贅墜綴諄準濁茲諮資漬蹤驟綜總縱鄒詛組鑽說話聽講討論譯記';

// One block of OCR text -> 'ja' | 'en' | 'zh-CN' | 'zh-TW' | null.
export function detectBlockLang(text) {
  if (!text || !text.trim()) return null;
  if (KANA_RE.test(text)) return 'ja';
  if (HANGUL_RE.test(text)) return null; // Korean: no OCR support, undetectable
  if (CJK_RE.test(text)) {
    let s = 0, t = 0;
    for (const ch of text) {
      if (SIMP_ONLY.includes(ch)) s++;
      else if (TRAD_ONLY.includes(ch)) t++;
    }
    // No distinctive chars: genuinely ambiguous (could be kanji-only
    // Japanese) — let the caller fall back.
    if (!s && !t) return null;
    return s >= t ? 'zh-CN' : 'zh-TW';
  }
  if (LATIN_RE.test(text)) return 'en';
  return null;
}

// Majority vote across a page's blocks. Ties / all-null -> null.
export function detectPageLang(texts) {
  const votes = { ja: 0, en: 0, 'zh-CN': 0, 'zh-TW': 0 };
  for (const t of texts || []) {
    const l = detectBlockLang(t);
    if (l) votes[l]++;
  }
  let best = null, bestN = 0, tie = false;
  for (const l of Object.keys(votes)) {
    if (votes[l] > bestN) { best = l; bestN = votes[l]; tie = false; }
    else if (votes[l] === bestN && bestN > 0) tie = true;
  }
  return tie ? null : best;
}
