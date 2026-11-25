# Indusfood Card Scanner

Take a photo of a buyer's visiting card. Gemini reads it, the lead is saved to Firebase, and you can send the buyer a WhatsApp message with one tap. A dashboard lets you filter, edit and follow up every lead.

**Stack:** Next.js 16 · Firebase (Firestore + Auth) · Google Gemini API · free hosting on Vercel.

---

## Setup (about 20–30 minutes, one time)

### 1. Firebase project (≈10 min)
1. Go to <https://console.firebase.google.com> and click **Create a project**. Analytics is not needed.
2. **Build → Firestore Database → Create database**. Pick location **asia-south1 (Mumbai)** and **production mode**.
3. Open the **Rules** tab, paste in the contents of `firestore.rules`, **replace `you@example.com` with your email**, then click **Publish**.
4. **Build → Authentication → Get started**. Enable **Google**. Optionally enable **Email/Password** too, then add yourself under *Users → Add user*.
5. **Project settings (⚙) → General → Your apps → Web (</>)**. Register the app; hosting is not needed. Copy `apiKey`, `authDomain`, `projectId` and `appId`.

### 2. Gemini API key (≈2 min)
Go to <https://aistudio.google.com/apikey> and click **Create API key**. The free tier is enough for an exhibition. If you hit the limit, turn on billing in AI Studio. It costs a few paise per card.

### 3. Put it online with Vercel (≈10 min)
1. Create a free account at <https://vercel.com>, ideally signed up with GitHub.
2. Upload this folder to a new GitHub repository. On github.com, click **New repository**, then **uploading an existing file**, and drag in everything from this zip.
3. In Vercel, click **Add New → Project**, import that repository, and open **Environment Variables**. Add every line from `.env.example` with your real values:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `GEMINI_API_KEY`
   - `ALLOWED_EMAILS`: your email, or several separated by commas
   - `GEMINI_MODEL`: optional, defaults to `gemini-3.5-flash`
4. Click **Deploy**. You get a link like `https://indusfood-card-scanner.vercel.app`.
5. **Important:** back in Firebase, go to **Authentication → Settings → Authorized domains → Add domain** and add your Vercel domain (without `https://`). Google sign-in won't work until you do this.

### 4. Install it on your phone
Open the link in Chrome (Android) or Safari (iPhone), sign in, then use **⋮ → Add to Home screen** or **Share → Add to Home Screen**. It opens full-screen like an app.

---

## Using it
- **Scan card:** photograph the front (and the back, if it has one) and tap **Read card**. Check the fields, mark Hot/Warm/Cold, add notes, then tap **Save & WhatsApp** or **Save lead**.
- **Dashboard:** shows totals, hot leads, buyers not yet messaged, follow-ups due and orders won (tap any number to filter). Change Interest and Stage right in the table. Tap **Edit** for everything else, including follow-up dates. **WhatsApp** is on every lead.
- **Settings:** your WhatsApp message (`{name}` and `{company}` fill in automatically) and the default country code.
- **Export:** **Download CSV** opens in Excel. **Copy for Google Sheets** lets you paste into cell A1 of a sheet.
- **Weak signal at the venue:** leads you save offline are kept on the phone and upload automatically when you're back online. Reading a card needs internet.

## Adding a teammate
Add their email to `firestore.rules` (then Publish) and to `ALLOWED_EMAILS` in Vercel (then Redeploy). They sign in with Google on their own phone and see the same leads.

## Running on your computer (optional)
```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
```
Also add `localhost` to Firebase's authorized domains (it's usually there already).

## Files
- `app/page.tsx`: scan screen
- `app/dashboard/page.tsx`: dashboard and editor
- `app/settings/page.tsx`: WhatsApp template
- `app/api/scan/route.ts`: sends photos to Gemini (server side, so your key stays secret)
- `components/AppProvider.tsx`: login and live Firestore sync
- `lib/leads.ts`: lead fields, WhatsApp link builder, CSV export
- `firestore.rules`: database security (edit the email!)
