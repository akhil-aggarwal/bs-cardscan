# Card Scanner

Take a photo of a visiting card at any exhibition. Gemini reads it, and the card is saved to Firebase as a **buyer** or a **vendor**, under the exhibition where you met. You can WhatsApp the person with one tap. A dashboard and a company view let you follow up on everyone.

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

### 3b. Turn on file storage for catalogues (≈2 min)
1. In Vercel, open your project and go to the **Storage** tab, then **Create Database / Create Store**, then **Blob**.
2. Name it `catalogues`, choose **Public** access, and click **Create**. Connect it to this project for all environments.
3. Vercel adds `BLOB_READ_WRITE_TOKEN` to your Environment Variables automatically.
4. Go to **Deployments → ⋯ → Redeploy**.

### 4. Install it on your phone
Open the link in Chrome (Android) or Safari (iPhone), sign in, then use **⋮ → Add to Home screen** or **Share → Add to Home Screen**. It opens full-screen like an app.

---

## Using it
- **Exhibitions** (Settings): add each fair once (name, city, dates). The current one is shown at the top of the app, and every card you scan is filed under it. With "Switch automatically" on, the app moves to an exhibition on its start date. Use "No exhibition" for office visits.
- **Scan card:** use **Camera**, or **Gallery** for photos you took earlier (you can select the front and back together). Tap **Read card**, choose **Buyer** or **Vendor**, add notes, then save.
- **Duplicates:** if the card is already saved (same phone, email, or name + company), the app says so. Saving then *updates* that person and records today's meeting instead of creating a copy. Tap "It's a different person" if it isn't the same person.
- **Companies:** people from the same company (e.g. Nestle) are grouped together automatically. On the scan screen you'll see "Also from Nestle: …", and the dashboard has a **Companies** view.
- **Voice notes:** tap **Speak note**. Your phone's own dictation is used first, which is free. If it comes out unclear, tap **Use Smart voice** (Gemini). Tick **Hindi / Hinglish** to always use Smart voice. Smart voice can also set the follow-up date and Hot/Warm/Cold from what you say.
- **Dashboard:** pick an exhibition and Buyers / Vendors. Totals, charts, the list and the CSV export all follow that choice. Each card shows where and when you met ("Indusfood 2026 · 25 Nov 2026").
- **Buyers vs vendors:** buyers have sales stages (Sample sent, Quotation sent, Order won) and get your buyer message plus catalogue. Vendors have purchase stages (Sample received, Quotation received, Approved vendor), a "What they supply" field, and their own message with no catalogue.
- **Settings → Attachments:** your catalogue or price list. Links go into buyer messages, and **Send PDF** shares the actual file.
- **Settings → WhatsApp messages:** separate buyer and vendor messages. `{name}`, `{company}`, `{exhibition}` and `{catalogue}` fill in automatically.
- **Settings → Error log:** if something goes wrong, tap **Copy log** and send it to Claude.
- **Export:** **Download CSV** opens in Excel. **Copy for Google Sheets** lets you paste into cell A1.
- **Weak signal:** cards you save offline are kept on the phone and upload later. Reading a card and Smart voice need internet.

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
- `app/page.tsx`: scan screen (gallery, duplicates, company hint)
- `components/VoiceNote.tsx`: voice notes (phone dictation, then Smart voice)
- `components/ErrorLog.tsx`: error log in Settings
- `app/api/voice/route.ts`: Smart voice (Gemini)
- `app/dashboard/page.tsx`: dashboard and editor
- `app/settings/page.tsx`: WhatsApp template
- `app/api/scan/route.ts`: sends photos to Gemini (server side, so your key stays secret)
- `components/AppProvider.tsx`: login and live Firestore sync
- `lib/leads.ts`: card fields, exhibitions, duplicate and company matching, WhatsApp messages, CSV export
- `firestore.rules`: database security (edit the email!)
