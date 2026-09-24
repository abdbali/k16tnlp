'use client';

import { useState } from 'react';

type EvalResponse = {
  respondentId?: string;
  ml?: { score: number; confidence: number; reason: string };
  feedback?: string;
  error?: string;
};

export default function HomePage() {
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EvalResponse | null>(null);

  function getClientId() {
    const storageKey = 'photosynthesisRespondentId';
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;

    const generated = window.crypto?.randomUUID?.() ?? `web_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(storageKey, generated);
    return generated;
  }

  async function onEvaluate() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer, clientId: getClientId() })
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error("Değerlendirme hatası:", err);
    } finally {
      setLoading(false);
    }
  }

  // Markdown içindeki resimleri HTML'e çeviren yardımcı fonksiyon
  const renderFeedback = (content: string) => {
    return content
      .replace(/\n/g, '<br/>') // Satır sonlarını br yap
      .replace(/!\[.*?\]\((.*?)\)/g, (match, url) => {
        // Hızlıresim linklerini doğrudan resim formatına zorla (i. ve .jpg ekle)
        let finalUrl = url.trim();
        if (finalUrl.includes("hizliresim.com") && !finalUrl.includes("i.hizliresim")) {
          finalUrl = finalUrl.replace("hizliresim.com", "i.hizliresim.com") + ".jpg";
        }
        return `<img src="${finalUrl}" referrerpolicy="no-referrer" style="width:100%; max-width:400px; border-radius:8px; margin:15px 0; display:block; border:1px solid #ddd;" />`;
      });
  };

  return (
    <main className="page">
      <h1>ML Değerlendirme Paneli</h1>
      
      <div className="grid">
        {/* SORU GÖRSELİ */}
        <section className="card">
          <h3>Soru Görseli</h3>
          <img 
            src="https://i.hizliresim.com/13b8voh.jpg" 
            alt="Soru"
            referrerPolicy="no-referrer"
            style={{ width: '100%', height: 'auto', borderRadius: '8px', display: 'block' }}
          />
        </section>

        {/* ÖĞRENCİ CEVABI */}
        <section className="card">
          <h3>Öğrenci Cevabı</h3>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Öğrenci cevabını buraya yazın..."
            style={{ minHeight: '200px', width: '100%', marginBottom: '1rem' }}
          />
          <button 
            disabled={loading || answer.trim().length === 0} 
            onClick={onEvaluate}
          >
            {loading ? 'Değerlendiriliyor...' : 'Değerlendir'}
          </button>
        </section>

        {/* SONUÇLAR */}
        <section className="card">

          {result?.error && <div className="result" style={{ color: 'red' }}>Hata: {result.error}</div>}

          {result?.respondentId && (
            <div className="result">
              <strong>Takip ID:</strong> {result.respondentId}
              <div className="small">Bu ID, Google Sheets kayıtlarında aynı öğrencinin cevap gelişimini izlemek için kullanılır.</div>
            </div>
          )}

          {result?.ml && (
            <div className="result">
              <strong>Makine Değerlendirme:</strong> {result.ml.score}/3
              <div className="small">Güven: {(result.ml.confidence * 100).toFixed(0)}%</div>
              <div className="small" style={{ fontStyle: 'italic' }}>{result.ml.reason}</div>
            </div>
          )}

          {result?.feedback && (
            <div className="result">
              <strong>Eğitsel Geribildirim:</strong>
              <div
                className="feedback-text"
                style={{ fontSize: '0.85rem', marginTop: '10px', lineHeight: '1.6' }}
                dangerouslySetInnerHTML={{ __html: renderFeedback(result.feedback) }}
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
