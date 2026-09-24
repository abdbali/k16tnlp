import { createHash, randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { evaluateWithML } from '@/lib/mlEvaluator';

// Değerlendirme sonuçlarını Google Sheets'e (Apps Script webhook üzerinden) gönderir.
// Hata olsa bile asıl yanıtı ASLA bozmaz (try/catch ile yutulur).
// Ayar: SHEETS_WEBHOOK_URL ortam değişkeni (Vercel'de tanımlayın).
type SheetLogPayload = {
  timestamp: string;
  respondentId: string;
  clientId: string;
  ipAddress: string;
  userAgent: string;
  answer: string;
  mlScore: number;
  mlConfidence: number;
  mlReason: string;
  mlMatchedRules: string;
  feedback: string;
  finalScore: number;
};


function getRequestIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('true-client-ip') ||
    'unknown'
  );
}

function normalizeClientId(clientId: unknown): string {
  return typeof clientId === 'string' && clientId.trim().length > 0
    ? clientId.trim().slice(0, 100)
    : '';
}

function buildRespondentId(ipAddress: string, userAgent: string, clientId: string): string {
  if (clientId) return clientId;

  const salt = process.env.RESPONDENT_ID_SALT ?? 'photosynthesis-hybrid-evaluator';
  return `srv_${createHash('sha256')
    .update(`${salt}|${ipAddress}|${userAgent}`)
    .digest('hex')
    .slice(0, 16)}`;
}

type SheetLogResponse = {
  respondentId?: string;
};

async function logToSheet(payload: SheetLogPayload): Promise<SheetLogResponse> {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return {}; // Webhook tanımlı değilse sessizce atla
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const result = await response.json().catch(() => ({}));
      return {
        respondentId: typeof result?.respondentId === 'string' ? result.respondentId : undefined
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    // Asla ana akışı bozma — sadece logla
    console.error('[sheet-log] Hata:', err);
    return {};
  }
}

type LevelFeedback = {
  level: number;
  content: string;
};

function getLevelFeedback(score: number): LevelFeedback {
  const normalized = Math.max(0, Math.min(3, Math.round(score)));

 const feedbackByLevel: Record<number, string> = {
  0: `Geribildirim:
Seviyen 3 üzerinden 0
Zayıf Yön	Fotosentez kavramına ilişkin temel bilgileri gözden kaçırdın.
Güçlü Yön	Tekrar düşünmeye ne dersin? Bu sorunun cevabını açıklayabileceğine eminim!
Öneriler:
![Akvaryum Şeması](https://i.hizliresim.com/e5sz4qq.jpg)
Görseldeki su bitkisini incele ve fotosentezin nasıl gerçekleştiğini açıklamaya çalış.
Tablodaki B Akvaryumu görseline bak. Işık az olunca bitkinin rengi ne olmuş? Bu renk değişimi bitkinin besin üretimi hakkında sana ne söylüyor? Düşün.
Soru	Yukarıdaki soruların cevaplarını da göz önünde bulundurarak fotosentezi açıkla.`,

  1: `Geribildirim:
Seviyen 3 üzerinden 1
Güçlü Yön	Fotosentezin ne olduğunu doğru açıklamışsın, güzel bir başlangıç.
Zayıf Yön	Besin zincirinde üreticilerin fotosentez ile olan ilişkisini gözden kaçırmışsın.
Öneriler	Sorudaki akvaryumlarda aşağıdaki gibi bir besin ağı bulunur. Besin ağını incele.
![Besin Ağı](https://i.hizliresim.com/tjndv7j.jpg)
Besin ağında üreticiler ve tüketiciler görüyorsun. Üreticiler besin ağının temelinde, başlangıcında yer alır. Su bitkisi üretici canlılardır.
Besin ağında “Su bitkisi → Su piresi → Küçük balık” arasında bir besin zinciri görüyorsun. Bu zincirde su bitkisi üreticidir.
Soru	Besin zincirinin ilk basamağındaki üreticiler (su bitkisi) fotosentez yaparak ne üretir ve üretilen maddeleri ne amaçla kullanır?`,

  2: `Geribildirim:
Seviyen 3 üzerinden 2
Güçlü Yön	Fotosentezi açıklıyorsun. Besin zincirinde üreticilerin fotosentez ile kendi besinlerini ürettiğini biliyorsun.
Zayıf Yön	Fotosentezin, tüketiciler ile olan ilişkisini gözden kaçırmışsın.
Öneriler	Verilen görselde bir besin ağı ve çeşitli besin zincirlerini görüyorsun. Besin ağını incele.
![Besin Ağı](https://i.hizliresim.com/tjndv7j.jpg)
Besin ağında üreticiler ve tüketiciler görüyorsun. Besin ağındaki üretici canlı su bitkisidir. Tüketici canlılar ise, deniz salyangozu, su piresi, yengeç, yılan balığı, küçük balık ve büyük balıktır.
Besin ağında “Su bitkisi → Su piresi → Küçük balık” arasında bir besin zinciri görüyorsun. Bu zincirde su bitkisi üreticidir. Su piresi otçul beslenen bir tüketicidir. Küçük balık ise su piresi ile beslenir.
B akvaryumunda işlerin yolunda gitmediğini anladın. Şimdi sağlıklı olan A akvaryumuna bak. Oradaki balıkların “aktif” olmasının nedenini düşün.
A akvaryumundaki ışığın küçük balığın kaslarına gelinceye kadar izlediği yolu düşünerek aşağıdaki soruyu cevaplayın.
Soru	Tüketiciler besin ihtiyaçlarını hangi canlılardan karşılar? Bu süreçte fotosentezin rolünü açıklayınız?`,

  3: `Geribildirim:
Seviyen 3 üzerinden 3
Güçlü Yön	Fotosentezi doğru bir şekilde açıkladın. Besin zincirinde su bitkisinin fotosentez yaparak kendi besinini ürettiğini biliyorsun. Su bitkileri tarafından üretilen besinin su piresi tarafından kullanıldığını ve küçük balığın da su piresiyle beslendiğini açıklayabildin. Böylece A akvaryumunda ışık yeterli olduğu için bitkinin canlı kaldığını, su piresi sayısının arttığını ve balıkların aktif olduğunu doğru şekilde ifade ettin.
Zayıf Yön	-
Öneriler	-
Soru	-`
};

  return { level: normalized, content: feedbackByLevel[normalized] };
}


export async function POST(request: Request) {
  try {
    const { answer, clientId: rawClientId } = await request.json();
    const clientId = normalizeClientId(rawClientId) || `web_${randomUUID()}`;
    const ipAddress = getRequestIp(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const respondentId = buildRespondentId(ipAddress, userAgent, clientId);

    if (!answer || typeof answer !== 'string') {
      return NextResponse.json({ error: 'Geçerli bir cevap giriniz.' }, { status: 400 });
    }

    const ml = evaluateWithML(answer);
    const levelFeedback = getLevelFeedback(ml.score);

    const sheetLog = await logToSheet({
      timestamp: new Date().toISOString(),
      respondentId,
      clientId,
      ipAddress,
      userAgent,
      answer,
      mlScore: ml.score,
      mlConfidence: ml.confidence,
      mlReason: ml.reasoning,
      mlMatchedRules: (ml.matchedRules ?? []).join(', '),
      feedback: levelFeedback.content,
      finalScore: ml.score
    });

    const displayRespondentId = sheetLog.respondentId ?? respondentId;

    return NextResponse.json({
      ml,
      feedback: levelFeedback.content,
      levelFeedback,
      respondentId: displayRespondentId
    });
  } catch (error) {
    return NextResponse.json({ error: 'Sunucu hatası', detail: String(error) }, { status: 500 });
  }
}
