# Mobile App Plan — PWA-first, Store-wrapper Optional (ROADMAP Phase 16)

**Filed:** 2026-06-10 · **Status:** DESIGN ONLY — committed plan, runtime PRs follow Phase 16 gates
**Answer to Boss:** ทำได้ — และไม่ต้องเขียนแอปใหม่. Single codebase = feature parity ของ desktop ครบอัตโนมัติ.

---

## §1 ทางเลือกที่วิเคราะห์ (3 ทาง)

| ทาง | คืออะไร | Parity | Cost | Verdict |
|---|---|---|---|---|
| **A. PWA** (Progressive Web App) | เว็บเดิม + manifest + service worker → "ติดตั้ง" เป็นไอคอนบนหน้าจอ เปิดเต็มจอเหมือนแอป + push notification | **100% — โค้ดเดียวกัน** | ต่ำมาก (ไม่มีค่า store, deploy ผ่าน Vercel เดิม) | ✅ **ทำก่อน (M1+M2)** |
| **B. Store wrapper** — Capacitor (iOS+Android) / TWA (Android) | ห่อเว็บเดิมเป็นแอปลง App Store / Play Store | 100% — ชี้ที่เว็บ production เดิม | Apple Dev $99/ปี + Play $25 ครั้งเดียว + review process | ⏸ optional (M3) — ทำเมื่ออยากมีตัวตนใน store |
| **C. React Native / Expo** | เขียนแอป native แยก codebase | ❌ ต้อง build ทุก feature ซ้ำ 2 รอบ ตลอดไป | สูงมาก + maintenance ×2 | ❌ REJECT — ขัด single-codebase principle |

**เหตุผลหลักเลือก A:** ux-design-plan principle P2 (mobile-first) ทำให้ทุกหน้า responsive อยู่แล้ว → PWA แปลงเว็บเป็น "แอป" ได้ทันทีโดย parity ครบโดยโครงสร้าง ไม่ใช่โดยสัญญา. Admin SaaS แบบเรา (ใช้ภายใน ไม่ง้อ store discovery) = PWA fit ที่สุด.

---

## §2 ข้อเท็จจริง technical (verified 2026-06-10)

| Fact | Source |
|---|---|
| **Serwist** = ตัวต่อ next-pwa ที่ maintain อยู่; **รองรับ Turbopack** (Next 16 default bundler) — next-pwa ต้อง webpack flag | [Serwist docs](https://serwist.pages.dev/docs/next/getting-started), [LogRocket Next 16 PWA](https://blog.logrocket.com/nextjs-16-pwa-offline-support/), [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps) |
| iOS web push ใช้ได้กับ **Home-Screen PWA** ตั้งแต่ iOS 16.4; ต้อง Add to Home Screen ก่อน (ไม่มี auto-prompt แบบ Android); >95% iPhone รองรับแล้ว | [Apple docs](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [MagicBell iOS PWA guide](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) |
| iOS 26: เว็บที่ add to home screen เปิดเป็น web app เป็น default แล้ว | [MobiLoud iOS PWA 2026](https://www.mobiloud.com/blog/progressive-web-apps-ios) |
| ข้อจำกัด push ใน EU (iOS 17.4+) — **ไม่กระทบ** ตลาดไทย/มาเลเซีย | [Pushpad iOS requirements](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications) |
| Android Chrome: install prompt อัตโนมัติ + push เต็มรูปแบบ | standard |
| next-auth session cookie ทำงานใน PWA standalone mode ได้ (same-origin) | ASSUMPTION — verify in M1 smoke (รายการทดสอบ §4 M1.7) |

---

## §3 Parity strategy — ทำไมรับประกัน "features ทุกอย่างเหมือน desktop"

1. **Single codebase:** PWA = เว็บเดิมเป๊ะ ทุก feature/route/permission เหมือนกัน ไม่มี "เวอร์ชั่นมือถือแยก" ให้ตามหลัง
2. **Mobile-friendly มาจาก standards ไม่ใช่ rework:** ux-design-plan §2.4 (table→card, bottom sheet, sticky action, tap ≥44px) + per-phase mobile checklist §5 บังคับทุก PR อยู่แล้ว → Phase 14 mobile sweep คือตัวปิด parity คุณภาพ
3. **Mobile-first features ที่ได้เพิ่มจากแอป:** ติดตั้งหน้าจอ (เปิดเร็ว ไม่พิมพ์ URL) · เต็มจอไม่มี browser bar · push เด้งเมื่อมีคำสั่งซื้อ/สลิป/แชท · camera capture สลิป/รูปสินค้า (`<input capture>` ทำงานใน PWA ได้ ไม่ต้อง native)

---

## §4 Sub-phases (= ROADMAP Phase 16)

### M1 — PWA installable (R1 light: แตะ next.config + service worker → dissent ก่อน)

| # | Task | ใคร |
|---|---|---|
| M1.1 | `@serwist/next` setup: `app/sw.ts` + `public/sw.js` gen + `manifest.ts` (ชื่อ "LiveShop Pro", ไอคอน maskable 192/512, theme color, display standalone) | Claude |
| M1.2 | App icons + splash (gen จาก logo — Boss ส่ง logo ไฟล์ใหญ่ 1 ครั้ง) | Claude (+Boss asset) |
| M1.3 | Offline policy: **read-only fallback** — หน้า offline บอกสถานะ + retry; **ห้าม offline mutation** (เสี่ยง stock/เงิน — queue sync = NOT in scope) | Claude |
| M1.4 | SW update flow: `reloadOnOnline` + new-version toast "มีเวอร์ชั่นใหม่ [รีเฟรช]" (กัน admin ค้าง SW เก่า) | Claude |
| M1.5 | In-app install banner: Android = `beforeinstallprompt` ปุ่มติดตั้ง; iOS = คู่มือภาพ "แชร์ → เพิ่มลงหน้าจอโฮม" (ไทย) | Claude |
| M1.6 | Tests: manifest served + SW registered + offline page renders + no SW cache on `/api/*` (สด เสมอ — admin data ห้าม stale) | Claude |
| M1.7 | [Boss] smoke บนมือถือจริง: ติดตั้ง Android + iPhone · login คงอยู่หลังปิดเปิดแอป · ทุกหน้าหลักใช้ได้ · camera upload สลิปได้ (Claude สอนไทยทีละขั้นตอนถึง) | **Boss** |

**DoD M1:** ติดตั้งได้ 2 platform · session คงอยู่ · `/api/*` ไม่ถูก cache · ทุก flow หลักผ่านบนมือถือจริง

### M2 — Web Push notifications (R1: schema + Boss env)

| # | Task | ใคร |
|---|---|---|
| M2.1 | [Boss] gen VAPID keys → ใส่ Vercel env เอง (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` — Claude สอนคำสั่ง gen, ไม่แตะค่า) | **Boss** |
| M2.2 | Schema PR: `PushSubscription` (userId, endpoint, keys, createdAt) — dissent + one migration | Claude |
| M2.3 | Subscribe UI ใน `/settings`: เปิด/ปิด push ต่อ event ประเภท (จองใหม่ / สลิปเข้า / แชทใหม่ / ตามลูกค้า due) | Claude |
| M2.4 | Send pipeline: server event → web-push ส่งตาม subscription; เริ่มจาก 2 events ที่มีอยู่แล้ว (booking created, payment slip uploaded); inbox events ตามมากับ Phase 10B | Claude |
| M2.5 | iOS note ใน UI: push ใช้ได้เมื่อติดตั้งหน้าจอแล้วเท่านั้น (banner เช็ค `display-mode: standalone`) | Claude |
| M2.6 | Tests: subscription CRUD shop-scoped · payload ไม่มี PII เกิน (ชื่อย่อ+ยอด ไม่มีเบอร์/ที่อยู่) · unsubscribe ทำงาน | Claude |
| M2.7 | [Boss] smoke: push เด้งจริงบน Android + iPhone (home-screen) | **Boss** |

**DoD M2:** push เด้ง 2 platforms · ตั้งค่าต่อ event ได้ · no-PII pinned · unsubscribe สะอาด

### M3 — Store wrapper (OPTIONAL — ทำเมื่อ Boss ตัดสินใจอยากอยู่ใน store)

| # | Task | ใคร |
|---|---|---|
| M3.1 | [Boss] ตัดสินใจ: ต้องการ App Store/Play Store ไหม? (ค่าใช้จ่าย: Apple $99/ปี, Google $25 ครั้งเดียว + review process) — default = ไม่ทำ, PWA พอ | **Boss** |
| M3.2 | ถ้าทำ: TWA (Android, ฟรี+ง่าย) ก่อน → Capacitor (iOS) ถ้าจำเป็นจริง | Claude |
| M3.3 | Store assets + privacy policy URL (มี `/privacy` แล้ว ✅) | Claude+Boss |

**Trigger:** Boss สั่งเท่านั้น. ไม่อยู่ใน critical path ใดๆ.

---

## §5 Preconditions + ลำดับใน roadmap

- **M1 precondition:** Phase 13 security checklist ผ่าน (SW = โค้ดที่รันถาวรบนเครื่อง admin — ต้อง audit ก่อน) + Phase 14 mobile sweep เสร็จ (ไม่งั้นติดตั้งแล้วเจอหน้า desktop-only = เสียความเชื่อมั่น)
- **M2 precondition:** M1 + Boss VAPID env
- **ทำคู่ขนาน Phase 15 rollout ได้** — PWA ไม่กระทบ user storefront (manifest scope ครอบ admin ได้; ตัดสินใจ scope ตอน M1.1: ทั้ง origin หรือเฉพาะ `(app)` — เสนอ: ทั้ง origin, storefront ได้ประโยชน์ฟรี)
- **ห้าม:** offline mutation queue (R0-adjacent กับ stock/เงิน) · push payload มี PII · SW cache `/api/*`

---

## §6 Risks

| Risk | Mitigation |
|---|---|
| iOS ติดตั้งยาก (ไม่มี auto-prompt) | M1.5 คู่มือภาพไทยในแอป + Boss สอนแอดมินครั้งเดียว |
| SW เก่าค้าง cache เว็บเก่า | M1.4 update toast + `updateViaCache: 'none'` + smoke ทุก deploy ใหญ่ |
| Session หลุดใน standalone mode | M1.7 smoke จริงก่อน merge; ถ้าเจอ → cookie SameSite/secure ตรวจ (R1) |
| Push spam → admin ปิดทิ้ง | M2.3 ตั้งค่าต่อ event ตั้งแต่แรก + default เปิดเฉพาะ จองใหม่+สลิป |
| EU iOS push limitation | ไม่กระทบ (ตลาด TH/MY) — note ไว้เผื่อขยายตลาด |

---

*Committed plan. ROADMAP Phase 16 อ้างไฟล์นี้. M3 = Boss-trigger only.*
