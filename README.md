# Photosynthesis ML Evaluator

Vercel üzerinde yayınlanabilecek, **3 sütunlu modern arayüz** ile çalışan ML tabanlı değerlendirme uygulaması:

- Sol sütun: Soru görseli
- Orta sütun: Öğrenci cevabı + Değerlendir butonu
- Sağ sütun: Rubrik görseli + ML sonucu + eğitsel feedback

## Kurulum

```bash
npm install
cp .env.example .env.local
# .env.local içine isteğe bağlı Google Sheets webhook bilgilerini yaz
npm run dev
```

## Görseller


<img width="545" height="1061" alt="image" src="https://github.com/user-attachments/assets/baea34d6-efed-40c4-8031-d46856c83369" />


## Dosya Yapısı

```txt
.
├─ app/
│  ├─ api/evaluate/route.ts      # ML değerlendirme API'si
│  ├─ globals.css                # Minimal modern stil
│  ├─ layout.tsx                 # Root layout
│  └─ page.tsx                   # 3 sütunlu ana ekran
├─ lib/
│  ├─ dataset.ts                 # Rubrik context + eğitim veri seti
│  └─ mlEvaluator.ts             # Basit ML benzerlik puanlama
├─ public/
│  ├─ question.svg               # Soru görseli
│  └─ rubric.svg                 # Rubrik görseli
├─ .env.example
├─ next.config.mjs
├─ package.json
└─ tsconfig.json
```

## Mimari

1. **ML Katmanı (`lib/mlEvaluator.ts`)**
   - Anahtar kavram tabanlı vektörleme + kosinüs benzerliği.
   - Veri setinden en yakın örneklerle 0-3 puan tahmini.

2. **Feedback Katmanı (`app/api/evaluate/route.ts`)**
   - ML puanına göre 0-3 düzeyli hazır eğitsel geribildirim döndürülür.
   - Dış servis veya API anahtarı kullanılmaz.

3. **Raporlama (`app/page.tsx`)**
   - ML sonucu, takip ID'si ve eğitsel feedback kullanıcıya sunulur.

## Vercel Yayını

1. GitHub'a push
2. Vercel'de projeyi import et
3. Environment Variable ekle:
   - `SHEETS_WEBHOOK_URL` (Google Sheets'e kayıt almak için Apps Script webhook URL'si)
   - `RESPONDENT_ID_SALT` (tarayıcı ID'si gelmezse IP + cihaz bilgisinden anonim takip ID üretmek için gizli değer)
4. Deploy



## Google Sheets Takip Alanları

Değerlendirme API'si her başarılı ML değerlendirmesinde `SHEETS_WEBHOOK_URL` adresine aşağıdaki alanları gönderir. Sheets tarafındaki Apps Script eski sütun listesini kullanıyorsa yeni alanlar görünmez; `docs/google-sheets-webhook.gs` dosyasındaki webhook örneğini Apps Script'e kopyalayıp yeniden deploy edin.

| Sütun | Alan | Açıklama |
| --- | --- | --- |
| A | `timestamp` | Değerlendirme zamanı. |
| B | `respondentId` | Giriş sırasına göre verilen takip ID'si (`Öğrenci_100`, `Öğrenci_101` ...). Gelişim takibi için ana filtre alanı budur. |
| C | `clientId` | Tarayıcıda `localStorage` içine kaydedilen kalıcı istemci ID'si. |
| D | `ipAddress` | İsteğin geldiği IP adresi (`x-forwarded-for`, `x-real-ip`, `cf-connecting-ip` veya `true-client-ip` başlıklarından okunur). |
| E | `userAgent` | Cihaz/tarayıcı bilgisi. |
| F | `answer` | Öğrenci cevabı. |
| G | `mlScore` | Makine değerlendirme puanı. |
| H | `mlConfidence` | Makine değerlendirme güveni. |
| I | `mlReason` | Makine değerlendirme gerekçesi. |
| J | `mlMatchedRules` | Eşleşen makine kuralları. |
| K | `feedback` | ML puanına göre dönen eğitsel geribildirim. |
| L | `finalScore` | Nihai ML puanı. |

Bu yapı sayesinde Google Sheets'te özellikle B sütunundaki `respondentId` ile filtreleme/sıralama yaparak aynı öğrencinin cevaplarındaki gelişimi zaman içinde takip edebilirsiniz. Apps Script aynı `clientId` ile gelen kayıtları aynı `Öğrenci_1XX` ID'sinde tutar; yeni `clientId` geldiğinde sıradaki numarayı verir. D sütunundaki `ipAddress` yalnızca yardımcı kaynak bilgisi olarak kullanılmalıdır; aynı ağdaki farklı öğrenciler aynı IP ile görünebilir. KVKK/gizlilik açısından IP adresi kişisel veri olabileceği için kullanım öncesinde gerekli bilgilendirme ve izin süreçlerini tamamlamanız önerilir.

### ID Sütunları Hâlâ Görünmüyorsa

Evet, bu durumda Google Sheets tarafında düzenleme yapmanız gerekir. Uygulama `respondentId`, `clientId`, `ipAddress` ve `userAgent` alanlarını webhook'a gönderir; ancak Apps Script kodu bu alanları satıra eklemiyorsa Sheet'te görünmez.

1. Google Sheet dosyanızda **Uzantılar → Apps Script** ekranını açın.
2. Mevcut `doPost` kodunu `docs/google-sheets-webhook.gs` içeriğiyle değiştirin.
3. Apps Script'te **Deploy → Manage deployments → Edit → New version → Deploy** adımlarını uygulayın. Sadece kodu kaydetmek yeterli değildir; web app yeniden deploy edilmelidir.
4. Yeni deploy URL'si değiştiyse Vercel'deki `SHEETS_WEBHOOK_URL` değerini yeni URL ile güncelleyin.
5. Sheet'te baktığınız sekmenin doğru olduğundan emin olun. Örnek script'te `SHEET_NAME` boş olduğu için bağlı dosyadaki aktif/ilk sekmeye yazar; belirli bir sekmeye yazdırmak isterseniz `SHEET_NAME` değerini o sekme adıyla doldurun.
6. Yeni bir değerlendirme gönderin. Mevcut eski satırlar geriye dönük ID kazanmaz; ID alanları yeni gönderilen satırlarda görünür.

Beklenen görünüm: `respondentId` B sütununda `Öğrenci_100`, `Öğrenci_101` şeklinde; `clientId` C sütununda, `ipAddress` D sütununda, `userAgent` E sütununda olmalıdır.


### Sıralı Öğrenci ID Mantığı

`docs/google-sheets-webhook.gs` içindeki Apps Script, yeni öğrencileri kayıt sırasına göre numaralandırır:

- İlk yeni öğrenci: `Öğrenci_100`
- İkinci yeni öğrenci: `Öğrenci_101`
- Üçüncü yeni öğrenci: `Öğrenci_102`

Aynı tarayıcıdan gelen sonraki cevaplarda `clientId` aynı kalacağı için aynı `respondentId` tekrar kullanılır. `clientId` yoksa aynı IP adresi ve aynı tarayıcı bilgisi (`userAgent`) eşleşmesi yedek kontrol olarak kullanılır.
