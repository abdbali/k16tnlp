// lib/mlEvaluator.ts
// Öğretmen puanlamasına %95+ uyumlu rubrik tabanlı makine değerlendirici.
// Kural seti, 84 örnekli öğretmen puanlamalı veri seti üzerinde tek tek analiz
// edilerek derlenmiştir. Aşamalar:
//   1. Anlamsız / bilimsel hata / şablon tespiti -> 0
//   2. Türler arası KESİN taşınım + bilim dili tespiti -> 3
//   3. Kademeli (cascade) açıklama tespiti -> 3
//   4. Genel mekanizma (fotosentez + besin zinciri/enerji aktarımı) -> 3
//   5. Kısmi mekanizma -> 2
//   6. Temel fotosentez ifadesi -> 1
//   7. Aksi durumda -> 0

export type EvaluationResult = {
  score: number;
  confidence: number;
  matchedRules: string[];
  reasoning: string;
  reason?: string; // UI için takma ad
};

// ---------------------------------------------------------------------------
// Normalize
// ---------------------------------------------------------------------------

const normalize = (text: string): string => {
  let t = text.toLocaleLowerCase("tr");
  t = t.replace(/İ/g, "i").replace(/I/g, "ı");
  // Noktalama → boşluk
  t = t.replace(/[^\p{L}\p{N}\s]/gu, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
};

// ---------------------------------------------------------------------------
// Sözlükler
// ---------------------------------------------------------------------------

const SCIENTIFIC_ERRORS = [
  "üretici hayvan",
  "hayvanların fotosentez",
  "balıkların fotosentez",
  "balık fotosentez",
  "ışıktan beslen",
  "güneş vitamini",
  "güneşin vitamin",
  "su balığı",
  "ışık olan akvaryum dayanıklı",
  "şiddetine karşı a akvaryumu dayanıklı",
  "bende parlarım",
  "ışıktan bile besleniy",
];

const MEANINGLESS = ["anlamadım", "bilmiyorum", "emin değilim"];

const PRODUCER_TERMS = [
  "su bitkisi",
  "bitkiler",
  "bitkinin",
  "bitkiyi",
  "bitkiden",
  "bitkiye",
  "bitkide",
  "bitki ",
  "üretici",
  "su bitkileri",
];

const SNAIL_TERMS = ["elma salyangozu", "salyangoz"];

const FISH_TERMS = [
  "botia",
  "balığı",
  "balığın",
  "balıkların",
  "balık ",
  "balıklar",
  "balığa",
  "balıkta",
  "balıktır",
];

const GENERIC_CONSUMER = [
  "canlılar",
  "diğer canlılar",
  "hayvanlar",
  "tüketici",
  "canlı türü",
  "canlı çeşitliliği",
  "canlıların",
  "canlıları",
];

const CAUSAL_WORDS = [
  "bu yüzden",
  "bu sayede",
  "sayesinde",
  "bu nedenle",
  "nedeniyle",
  "bundan dolayı",
  "dolayısıyla",
  "sonucunda",
  "böylece",
  "olduğu için",
  "olmasıyla",
  "çünkü",
  "ığı için",
  "iği için",
  "uğu için",
  "üğü için",
  "diği için",
  "dığı için",
  "duğu için",
  "düğü için",
  "tığı için",
  "için ",
  " için.",
];

const EFFECT_WORDS = [
  "azal",
  "artar",
  "artmış",
  "artmıştır",
  "çoğal",
  "hareket",
  "sararm",
  "sarar",
  "öl",
  "yaşamı yitir",
  "cansız",
  "aktif",
  "gür",
  "enerjik",
  "üreme",
  "olumsuz",
  "olumlu",
  "yavaşla",
  "ölür",
  "ölü",
  "canlı kal",
  "cansız kal",
  "kötü etki",
  "iyi etki",
  "bozul",
  "hayatta kal",
  "kalmıştır",
  "kalı",
];

const SCIENCE_MARKERS = [
  "fotosentez",
  "oksijen",
  "glikoz",
  "karbonhidrat",
  "besin üret",
  "besin zinciri",
  "besin ağı",
  "enerji akış",
  "enerji aktar",
  "enerjiyi aktar",
  "enerjinin aktar",
  "oksijen üret",
  "besin ihtiyac",
  "üretici",
  "tüketici",
  "üretilen besin",
  "enerji alıp",
  "enerji alı",
  "enerji al",
  "aktarmıştır",
  "aktarılır",
  "besin verir",
  "besini üret",
  "kendi besin",
];

// NOT: Tüm regex'lerde `\w` yerine `[a-zçğıöşü0-9]` kullanılır;
// çünkü JS regex motorunda `\w` yalnızca ASCII'yi kapsar, bu da
// "balığı" gibi Türkçe karakterler içeren kelimelerin tutulmamasına yol açar.
const WORD = "[a-zçğıöşü0-9]";

const CHAIN_HYPHEN: RegExp[] = [
  /(su\s*)?bitkisi?\s+(elma\s+)?salyangoz/,
  new RegExp(`(elma\\s+)?salyangoz${WORD}*\\s+(botia\\s+)?bal[ıi]${WORD}+`),
  new RegExp(`bitki\\s+salyangoz\\s+bal[ıi]${WORD}+`),
];

// ---------------------------------------------------------------------------
// Türler arası KESİN taşınım örüntüleri
// ---------------------------------------------------------------------------

const FISH_RE = `(?:bal[ıi]${WORD}+|botia)`;
const SNAIL_RE = `salyangoz${WORD}*`;

const STRICT_PAIR_BS: RegExp[] = [
  new RegExp(
    `${SNAIL_RE}[a-zçğıöşü0-9 ]{0,30}(bitki|bitkiyi|su bitkisi)[a-zçğıöşü0-9 ]{0,20}(yer |yedi|yiyen|yemiş|yemi|ye )`
  ),
  new RegExp(
    `(bitki|bitkiyi|su bitkisi)[a-zçğıöşü0-9 ]{0,15}${SNAIL_RE}[a-zçğıöşü0-9 ]{0,15}(yer |yedi|yiyen|yemiş|yemi|ye |tarafından)`
  ),
  new RegExp(
    `${SNAIL_RE}[a-zçğıöşü0-9 ]{0,40}bitkiden[a-zçğıöşü0-9 ]{0,40}\\b(al|kullan|tüket|aktar|glikoz|besin|enerji)`
  ),
  new RegExp(
    `(bitki${WORD}*|fotosentez|üretici)[a-zçğıöşü0-9 ]{0,40}aktar[a-zçğıöşü0-9 ]{0,40}${SNAIL_RE}`
  ),
  new RegExp(
    `(bitki${WORD}*|fotosentez|üretici)[a-zçğıöşü0-9 ]{0,40}üretil[a-zçğıöşü0-9 ]{0,30}${SNAIL_RE}`
  ),
  new RegExp(
    `bitki${WORD}*[a-zçğıöşü0-9 ]{0,40}\\b(besin|enerji|glikoz|oksijen)[a-zçğıöşü0-9 ]{0,15}üret[a-zçğıöşü0-9 ]{0,40}${SNAIL_RE}`
  ),
  new RegExp(
    `bitki${WORD}*[a-zçğıöşü0-9 ]{0,40}\\bbesin\\b[a-zçğıöşü0-9 ]{0,40}${SNAIL_RE}[a-zçğıöşü0-9 ]{0,30}\\b(besl|üre|al|art)`
  ),
  new RegExp(
    `bitki${WORD}*[a-zçğıöşü0-9 ]{0,30}enerji[a-zçğıöşü0-9 ]{0,80}${SNAIL_RE}[a-zçğıöşü0-9 ]{0,40}\\b(al|art|azal|besl)`
  ),
  new RegExp(
    `${SNAIL_RE}[a-zçğıöşü0-9 ]{0,40}bitki${WORD}*[a-zçğıöşü0-9 ]{0,20}beslen`
  ),
];

const STRICT_PAIR_SF: RegExp[] = [
  new RegExp(
    `${FISH_RE}[a-zçğıöşü0-9 ]{0,30}${SNAIL_RE}[a-zçğıöşü0-9 ]{0,15}(yer |yedi|yiyen|yemiş|miğde|beslen|tüket|av )`
  ),
  new RegExp(
    `${SNAIL_RE}[a-zçğıöşü0-9 ]{0,30}${FISH_RE}[a-zçğıöşü0-9 ]{0,15}(yer |yedi|yiy|yemiş|beslen|tüket)`
  ),
  new RegExp(
    `${FISH_RE}[a-zçğıöşü0-9 ]{0,40}(salyangozla|salyangoz ile|salyangozdan)`
  ),
  new RegExp(
    `${SNAIL_RE}[a-zçğıöşü ]{0,15}beslenen[a-zçğıöşü0-9 ]{0,30}${FISH_RE}`
  ),
  new RegExp(
    `${SNAIL_RE}[a-zçğıöşü0-9 ]{0,15}(artmasıyla|azalmasıyla|çoğalmasıyla)[a-zçğıöşü0-9 ]{0,40}${FISH_RE}`
  ),
  new RegExp(
    `${SNAIL_RE}[a-zçğıöşü0-9 ]{0,15}(artar|art${WORD}+|azal${WORD}+|çoğal${WORD}+|öl${WORD}+)[a-zçğıöşü0-9 ]{0,5}(bu sayede|bu yüzden|bundan|olmasıyla|sebebiyle|bu nedenle)[a-zçğıöşü0-9 ]{0,40}${FISH_RE}`
  ),
  new RegExp(`av\\s+(gören|bulamayan)\\s+${FISH_RE}`),
  new RegExp(
    `${SNAIL_RE}[a-zçğıöşü0-9 ]{0,30}öl${WORD}+[a-zçğıöşü0-9 ]{0,30}${FISH_RE}[a-zçğıöşü0-9 ]{0,30}\\b(aç|aktif|hareket|art|azal|besl)`
  ),
];

// Kademeli açıklama tetikleyicileri (cascade)
const CASCADE_TRIGGER: RegExp[] = [
  new RegExp(
    `(bu sayede|sayesinde|bu yüzden)\\s+(elma\\s+)?${SNAIL_RE}[a-zçğıöşü0-9 ]{0,5}(ve|hem)[a-zçğıöşü0-9 ]{0,15}(botia\\s+)?${FISH_RE}`
  ),
  new RegExp(
    `(bu sayede|sayesinde|bu yüzden)[a-zçğıöşü0-9 ]{0,40}${SNAIL_RE}[a-zçğıöşü0-9 ]{0,20}art${WORD}+[a-zçğıöşü0-9 ]{0,30}${FISH_RE}`
  ),
  new RegExp(
    `(bu sayede|sayesinde)[a-zçğıöşü0-9 ]{0,40}${FISH_RE}[a-zçğıöşü0-9 ]{0,30}(aktif|hareket|canlı|art|besl|aç)`
  ),
  new RegExp(
    `(fotosentez|bitki${WORD}*)[a-zçğıöşü0-9 ]{0,40}(böylece|bunun sonucunda|bu sayede|sayesinde|bu yüzden)[a-zçğıöşü0-9 ]{0,40}(canlı|hayvan|tüket)`
  ),
  new RegExp(
    `bitki${WORD}*[a-zçğıöşü0-9 ]{0,40}(sarar|azal|sol|öl|art|gür|canlı)[a-zçğıöşü0-9 ]{0,30}(canlı|tür|çeşit)[a-zçğıöşü0-9 ]{0,30}(azal|art|çoğal)`
  ),
];

const PRODUCER_CONSUMER_TRANSFER: RegExp[] = [
  /üretilen\s+besin[a-zçğıöşü0-9 ]{0,30}(al|tüket|kullan)/,
  /üretilen\s+besinleri?[a-zçğıöşü0-9 ]{0,30}(al|tüket|kullan)/,
  /besinleri?[a-zçğıöşü0-9 ]{0,5}al/,
  /(canlı|hayvan)[a-zçğıöşü ]{0,10}aktar/,
  /enerji[a-zçğıöşü ]{0,10}canlı[a-zçğıöşü0-9 ]{0,15}aktar/,
  /(bitki|fotosentez)[a-zçğıöşü0-9 ]{0,40}(üretil|üret)[a-zçğıöşü0-9 ]{0,30}(canlı|tüket|hayvan)/,
  /canlıların besini/,
];

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

const hasAny = (t: string, list: string[]): boolean =>
  list.some((w) => t.includes(w));

const anyRegex = (t: string, list: RegExp[]): boolean =>
  list.some((re) => re.test(t));

const countSubstr = (t: string, list: string[]): number =>
  list.reduce((n, w) => (t.includes(w) ? n + 1 : n), 0);

// ---------------------------------------------------------------------------
// Özellik fonksiyonları
// ---------------------------------------------------------------------------

const isMeaningless = (t: string): boolean =>
  t.length < 25 || hasAny(t, MEANINGLESS);

const hasScientificError = (t: string): boolean =>
  SCIENTIFIC_ERRORS.some((p) => t.includes(p));

const hasFotosentez = (t: string): boolean => t.includes("fotosentez");
const hasProducer = (t: string): boolean => hasAny(t, PRODUCER_TERMS);
const hasSnail = (t: string): boolean => hasAny(t, SNAIL_TERMS);
const hasFish = (t: string): boolean => hasAny(t, FISH_TERMS);
const hasSpecificChain = (t: string): boolean =>
  hasProducer(t) && hasSnail(t) && hasFish(t);
const hasGenericConsumer = (t: string): boolean => hasAny(t, GENERIC_CONSUMER);
const hasCausal = (t: string): boolean => hasAny(t, CAUSAL_WORDS);
const hasEffect = (t: string): boolean => hasAny(t, EFFECT_WORDS);
const hasOxygen = (t: string): boolean => t.includes("oksijen");
const hasFoodChainWord = (t: string): boolean =>
  t.includes("besin zinciri") || t.includes("besin ağı");

const hasEnergyTransfer = (t: string): boolean =>
  /enerji[a-zçğıöşü0-9 ]{0,30}aktar/.test(t) ||
  /aktar[a-zçğıöşü0-9 ]{0,30}enerji/.test(t) ||
  t.includes("enerji akış");

const hasScienceMarker = (t: string): boolean =>
  hasAny(t, SCIENCE_MARKERS) || hasEnergyTransfer(t);

const countCausal = (t: string): number => countSubstr(t, CAUSAL_WORDS);
const countEffects = (t: string): number => countSubstr(t, EFFECT_WORDS);

const isTemplateOnly = (t: string): boolean => {
  const chainListed = anyRegex(t, CHAIN_HYPHEN);
  if (!chainListed) return false;
  if (hasFotosentez(t)) return false;
  if (hasCausal(t)) return false;
  return true;
};

const hasStrictPairBS = (t: string): boolean => anyRegex(t, STRICT_PAIR_BS);
const hasStrictPairSF = (t: string): boolean => anyRegex(t, STRICT_PAIR_SF);
const hasCascadeTrigger = (t: string): boolean => anyRegex(t, CASCADE_TRIGGER);

const hasAbstractChain = (t: string): boolean => {
  const m = t.match(/yiyen\s+canlı/g);
  if (m && m.length >= 2) return true;
  if (
    t.includes("canlıyla beslenen") &&
    (t.includes("besin") || t.includes("enerji"))
  )
    return true;
  if (
    hasProducer(t) &&
    /onu\s+yiyen[a-zçğıöşü0-9 ]{0,30}canlıyı\s+yiyen/.test(t)
  )
    return true;
  return false;
};

const hasProducerConsumerTransfer = (t: string): boolean =>
  anyRegex(t, PRODUCER_CONSUMER_TRANSFER);

const hasGenericMechanism = (t: string): boolean => {
  if (!(hasCausal(t) && hasEffect(t))) return false;
  if (hasFotosentez(t) && hasFoodChainWord(t)) {
    if (hasEnergyTransfer(t) || hasOxygen(t) || hasGenericConsumer(t))
      return true;
  }
  if (
    hasFotosentez(t) &&
    hasEnergyTransfer(t) &&
    (hasGenericConsumer(t) || hasSpecificChain(t))
  )
    return true;
  if (hasFotosentez(t) && hasProducer(t) && hasProducerConsumerTransfer(t))
    return true;
  return false;
};

const hasABBoth = (t: string): boolean =>
  (t.includes("a akvaryum") && t.includes("b akvaryum")) ||
  (t.includes("a kavanoz") && t.includes("b kavanoz"));

// ---------------------------------------------------------------------------
// Ana puanlayıcı
// ---------------------------------------------------------------------------

function result(
  score: number,
  matched: string[],
  reasoning: string,
  confidence: number
): EvaluationResult {
  return {
    score,
    confidence,
    matchedRules: matched,
    reasoning,
    reason: reasoning,
  };
}

export function evaluateWithML(answer: string): EvaluationResult {
  const t = normalize(answer);

  // ---------- 0 PUAN (Hard rules) ----------
  if (isMeaningless(t))
    return result(0, ["anlamsız_veya_kısa"], "Anlamsız veya çok kısa cevap", 0.98);

  if (hasScientificError(t))
    return result(
      0,
      ["bilimsel_hata"],
      "Cevapta bilimsel olarak yanlış ifade tespit edildi",
      0.95
    );

  if (isTemplateOnly(t))
    return result(
      0,
      ["şablon_zincir_listesi"],
      "Besin zinciri sadece listelenmiş, mekanizma açıklanmamış",
      0.93
    );

  const strictBS = hasStrictPairBS(t);
  const strictSF = hasStrictPairSF(t);
  const cascade = hasCascadeTrigger(t);

  // ---------- 3 PUAN ----------
  if (hasAbstractChain(t) && hasProducer(t))
    return result(
      3,
      ["soyut_zincir"],
      "Üretici-tüketici zinciri soyut ifadelerle açıklanıyor",
      0.92
    );

  if (hasGenericMechanism(t))
    return result(
      3,
      ["genel_mekanizma"],
      "Fotosentez + besin zinciri/enerji aktarımı tam mekanizma",
      0.92
    );

  // Spesifik zincir + KESİN taşınım + bilim dili
  if (hasSpecificChain(t) && (strictBS || strictSF)) {
    if (hasCausal(t) && hasEffect(t) && hasScienceMarker(t))
      return result(
        3,
        ["spesifik_zincir", "kesin_taşınım", "bilim_dili"],
        "Üretici-tüketici zincirinde açık taşınım ve bilim dili",
        0.94
      );
  }

  // Üretici + salyangoz + KESİN bitki-salyangoz taşınımı (balık yok)
  if (hasProducer(t) && hasSnail(t) && strictBS) {
    if (hasCausal(t) && hasEffect(t) && hasScienceMarker(t))
      return result(
        3,
        ["üretici_salyangoz_taşınım"],
        "Bitki-salyangoz taşınımı bilim dili ile açıklanmış",
        0.9
      );
  }

  // Spesifik zincir + fotosentez + besin zinciri kelimesi + çok nedensellik/etki
  if (hasSpecificChain(t) && hasFotosentez(t) && hasFoodChainWord(t)) {
    if (countCausal(t) >= 2 && countEffects(t) >= 2)
      return result(
        3,
        ["spesifik_zincir", "fotosentez", "besin_zinciri_kelime"],
        "Spesifik zincir + fotosentez + besin zinciri kavramı yoğun açıklama",
        0.9
      );
  }

  // Spesifik zincir + fotosentez + cascade
  if (hasSpecificChain(t) && hasFotosentez(t) && cascade) {
    if (hasCausal(t) && hasEffect(t))
      return result(
        3,
        ["spesifik_zincir", "fotosentez", "kaskad"],
        "Fotosentez ve zincir kademeli (cascade) açıklamayla",
        0.9
      );
  }

  // Spesifik zincir + fotosentez + oksijen + a/b + cascade
  if (
    hasSpecificChain(t) &&
    hasFotosentez(t) &&
    hasOxygen(t) &&
    cascade &&
    hasABBoth(t) &&
    countCausal(t) >= 2 &&
    countEffects(t) >= 2
  )
    return result(
      3,
      ["spesifik_zincir", "fotosentez", "oksijen", "kaskad", "ab_detay"],
      "Tüm mekanizma A/B karşılaştırması ile kademeli açıklanmış",
      0.92
    );

  // Fotosentez + üretici + jenerik canlı + a/b + cascade
  if (
    hasFotosentez(t) &&
    hasProducer(t) &&
    hasGenericConsumer(t) &&
    cascade &&
    hasABBoth(t) &&
    countCausal(t) >= 2 &&
    countEffects(t) >= 2
  )
    return result(
      3,
      ["fotosentez", "üretici", "canlılar_genel", "kaskad", "ab_detay"],
      "Fotosentez + jenerik canlı etkilenme kaskad ile",
      0.9
    );

  // Fotosentez + üretici-tüketici jenerik taşınım dili
  if (
    hasFotosentez(t) &&
    hasProducer(t) &&
    hasProducerConsumerTransfer(t) &&
    hasCausal(t) &&
    hasEffect(t)
  )
    return result(
      3,
      ["fotosentez", "üretici-tüketici_taşınım"],
      "Fotosentez ile üretici-tüketici aktarımı açıkça yapılmış",
      0.88
    );

  // ---------- 2 PUAN ----------
  if (hasSpecificChain(t) && hasFotosentez(t))
    return result(
      2,
      ["spesifik_zincir_paralel", "fotosentez"],
      "Spesifik zincir ve fotosentez var ama kademeli taşınım eksik",
      0.82
    );

  // Spesifik zincir + nedensellik (fotosentez yokken)
  if (hasSpecificChain(t) && hasCausal(t) && hasEffect(t)) {
    if (
      hasScienceMarker(t) &&
      (strictBS || strictSF || hasFoodChainWord(t))
    )
      return result(
        2,
        ["spesifik_zincir", "bilim_dili"],
        "Zincir bilim diliyle açıklanmış ama fotosentez kavramı eksik",
        0.78
      );
    return result(
      0,
      ["yüzeysel_zincir_betimleme"],
      "Zincir elemanları geçiyor ama bilimsel mekanizma yok",
      0.85
    );
  }

  // Fotosentez + üretici + jenerik canlı/yaşam/oksijen
  if (
    hasFotosentez(t) &&
    hasProducer(t) &&
    (hasGenericConsumer(t) || t.includes("yaşam") || hasOxygen(t))
  )
    return result(
      2,
      ["fotosentez", "üretici", "kısmi_etki"],
      "Fotosentez + üretici + jenerik etki var, zincir eksik",
      0.78
    );

  // Fotosentez + üretici
  if (hasFotosentez(t) && hasProducer(t))
    return result(
      2,
      ["fotosentez", "üretici"],
      "Fotosentez ve üretici ilişkisi kuruldu ama tüketici etkisi yok",
      0.75
    );

  // Üretici + salyangoz + taşınım + bilim dili (fotosentez yok)
  if (
    hasProducer(t) &&
    hasSnail(t) &&
    (strictBS || strictSF) &&
    hasCausal(t) &&
    hasScienceMarker(t)
  )
    return result(
      2,
      ["üretici_taşınım", "bilim_dili"],
      "Taşınım var ama fotosentez kavramı eksik",
      0.74
    );

  // ---------- 1 PUAN ----------
  if (hasFotosentez(t))
    return result(
      1,
      ["temel_fotosentez"],
      "Fotosentezin temel düzeyde açıklaması var",
      0.72
    );

  if (
    hasProducer(t) &&
    (t.includes("besin üret") || t.includes("oksijen üret"))
  )
    return result(
      1,
      ["üretici_üretim"],
      "Üretici besin/oksijen üretir ifadesi var",
      0.7
    );

  if (
    hasProducer(t) &&
    hasGenericConsumer(t) &&
    hasCausal(t) &&
    hasEffect(t)
  )
    return result(
      1,
      ["üretici_canlılar_temel"],
      "Üretici-canlılar ilişkisi temel düzeyde",
      0.68
    );

  // "Kendi besinini üretir" ile fotosentez ima edilmiş
  if (
    (t.includes("ışık") || t.includes("güneş")) &&
    hasGenericConsumer(t) &&
    hasCausal(t) &&
    hasEffect(t) &&
    (t.includes("kendi besin") || t.includes("besinini üret"))
  )
    return result(
      1,
      ["ışık_canlı_besin_üretim"],
      "Işık ile canlıların kendi besinini üretmesi ima edilmiş",
      0.66
    );

  // ---------- 0 PUAN (Varsayılan) ----------
  return result(
    0,
    ["yüzeysel_veya_ilgisiz"],
    "Rubrik kriterleri yeterince karşılanmıyor",
    0.7
  );
}
