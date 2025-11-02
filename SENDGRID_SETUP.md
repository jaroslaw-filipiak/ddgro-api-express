# Konfiguracja SendGrid - Unified Email Service

## 🔧 Zmiany w kodzie

System został **uproszczony i ujednolicony** - teraz używa **SendGrid API** dla wszystkich środowisk.

### Co się zmieniło:
- ✅ **Development**: Używa **SendGrid API** (z development API key)
- ✅ **Production**: Używa **SendGrid API** (z production API key)
- ❌ **Usunięto**: Kod SMTP (nodemailer) - już nie jest używany

### Korzyści ujednolicenia:
- 🎯 **Prostsza konfiguracja** - jedna metoda wysyłki dla obu środowisk
- 🔧 **Łatwiejsze debugowanie** - ten sam kod i logi wszędzie
- 📊 **Lepszy monitoring** - wszystkie emaile w jednym dashboardzie SendGrid
- ⚡ **Szybsze wysyłanie** - API jest szybsze niż SMTP

## 📝 Kroki konfiguracji

### 1. Uzyskaj klucze API SendGrid

Potrzebujesz **dwóch osobnych** kluczy API - jeden dla development, drugi dla production.

#### Development API Key:
1. Zaloguj się do [SendGrid Dashboard](https://app.sendgrid.com/)
2. **Settings → API Keys → Create API Key**
3. Nazwa: `DDGRO Development`
4. Uprawnienia: **Mail Send** (minimum)
5. **Skopiuj klucz** (wyświetli się tylko raz!)

#### Production API Key:
1. W tym samym miejscu: **Create API Key**
2. Nazwa: `DDGRO Production`
3. Uprawnienia: **Mail Send** (minimum)
4. **Skopiuj klucz** (wyświetli się tylko raz!)

### 2. Skonfiguruj Development (lokalnie)

W pliku `server/.env`:
```bash
SENDGRID_API_KEY=SG.xxxxxxxxxx-DEVELOPMENT-KEY-xxxxxxxxxxxx
NODE_ENV=development
```

### 3. Skonfiguruj Production (Render)

1. Przejdź do [Render Dashboard](https://dashboard.render.com/)
2. Wybierz serwis: **ddgro-api-express** (produkcja)
3. Przejdź do: **Environment → Environment Variables**
4. Dodaj/zaktualizuj zmienne:
   ```
   SENDGRID_API_KEY=SG.xxxxxxxxxx-PRODUCTION-KEY-xxxxxxxxxxxx
   NODE_ENV=production
   ```
5. Zapisz zmiany

### 4. Zweryfikuj domenę w SendGrid (WAŻNE!)

Aby uniknąć problemów z dostarczalnością email:

1. W SendGrid Dashboard → **Settings → Sender Authentication**
2. Kliknij **Verify a Single Sender** LUB **Authenticate Your Domain**
3. Dla domeny: Dodaj **ddgro.eu** lub **noreply@ddpedestals.eu**
4. Postępuj zgodnie z instrukcjami SendGrid

### 5. Usuń stare zmienne SMTP (opcjonalnie)

Możesz usunąć następujące zmienne z obu środowisk (już nie są używane):
```
DEV_MAIL_HOST
DEV_MAIL_PORT
DEV_MAIL_USERNAME
DEV_MAIL_PASSWORD
MAIL_HOST
MAIL_PORT
MAIL_USERNAME
MAIL_PASSWORD
MAIL_MAILER
MAIL_ENCRYPTION
```

## 🧪 Testowanie

### Test lokalny (development):
```bash
cd server
npm run dev
# Lub jawnie:
NODE_ENV=development npm run dev
```

Oczekiwane logi:
```
📧 Email service starting...
📧 Initializing SendGrid API...
environment: 'development'
📧 SendGrid API initialized in Xms
📧 Sending email via SendGrid API...
📧 Email sent in Xms
```

### Test produkcyjny:
```bash
cd server
NODE_ENV=production npm start
```

Oczekiwane logi:
```
📧 Initializing SendGrid API...
environment: 'production'
📧 Email sent in Xms
```

### Test wysyłki email:

Endpoint testowy:
```bash
POST https://ddgro-api-express.onrender.com/api/application/send-order-summary/:applicationId
Body: { "to": "test@example.com" }
```

Sprawdź logi w Render:
```
📧 Initializing SendGrid API...
environment: 'production'
📧 SendGrid API initialized in Xms
📧 Sending email via SendGrid API...
📧 Email sent in Xms
📧 SendGrid response: { statusCode: 202, ... }
```

## 📊 Monitoring

### SendGrid Dashboard
- **Activity Feed**: Zobacz wszystkie wysłane emaile
- **Statistics**: Sprawdź delivery rate, open rate, etc.
- **Suppressions**: Sprawdź bounces i spam complaints

### Render Logs
```bash
# W Render Dashboard → Logs
# Szukaj:
"📧 SendGrid"
"Email sent successfully via SendGrid API"
```

## ⚠️ Rozwiązywanie problemów

### Błąd: "SENDGRID_API_KEY is not configured"
➡️ Sprawdź czy zmienna `SENDGRID_API_KEY` jest ustawiona w Render

### Błąd 401: "Unauthorized"
➡️ Klucz API jest nieprawidłowy - wygeneruj nowy w SendGrid

### Błąd 403: "Forbidden"
➡️ Sprawdź uprawnienia klucza API (musi mieć Mail Send)

### Email nie dochodzi
➡️ Sprawdź:
1. Czy domena/sender jest zweryfikowany w SendGrid
2. Activity Feed w SendGrid Dashboard
3. Suppressions list (bounces, spam)

## 🔄 Rollback (powrót do SMTP)

Jeśli potrzebujesz wrócić do SMTP:

1. Przywróć poprzednią wersję `server/services/sendEmail.js` z git
2. Reinstaluj `nodemailer` jeśli został usunięty z `package.json`
3. Skonfiguruj zmienne SMTP w `.env`

## 📌 Notatki

- **Wszystkie środowiska** używają teraz SendGrid API
- **Różne klucze API**: Używaj osobnych kluczy dla development i production
- SendGrid limit: **100 emails/day** (plan darmowy), więcej w planach płatnych
- Rate limit: ~5 emails/sekunda (automatycznie obsługiwane przez SDK)
- **Brak SMTP**: Kod nodemailer został usunięty - prostsza implementacja

## 🔐 Bezpieczeństwo

- ✅ Klucz API jest bezpiecznie przechowywany w zmiennych środowiskowych
- ✅ Klucz API **nigdy** nie jest commitowany do repozytorium
- ✅ Używaj różnych kluczy dla development i production
- ⚠️ Regularnie rotuj klucze API (co 90 dni)

---

**Data zmiany**: 2025-11-02
**Wersja**: 2.0 (Unified SendGrid)
**Autor**: Claude Code

## 📜 Historia zmian

### v2.0 (2025-11-02)
- ✅ Ujednolicono na SendGrid API dla wszystkich środowisk
- ❌ Usunięto kod SMTP (nodemailer)
- 📝 Uproszczono konfigurację

### v1.0 (2025-11-02)
- ✅ Pierwsza wersja z SendGrid dla produkcji
- Development nadal używał SMTP
