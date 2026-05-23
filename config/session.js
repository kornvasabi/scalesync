/**
 * =============================================================================
 * config/session.js — ตั้งค่า "การจำว่าผู้ใช้ล็อกอินอยู่" (Session + Cookie)
 * =============================================================================
 *
 * หลังล็อกอินสำเร็จ แอปจะเก็บข้อมูล user ใน req.session (ฝั่งเซิร์ฟเวอร์)
 * และส่ง "บัตรจำ" กลับเบราว์เซอร์เป็น Cookie (ชื่อ emis.sid)
 *
 * ค่าที่ปรับได้ใน .env:
 *   SESSION_SECRET       — รหัสลับสำหรับเข้ารหัส session (production ต้องมี)
 *   SESSION_MAX_MINUTES  — อายุ session เป็นนาที (ค่าเริ่มต้น 30)
 *   SESSION_COOKIE_NAME  — ชื่อ cookie (ค่าเริ่มต้น emis.sid)
 *
 * ใช้ใน app.js:  app.use(createSessionMiddleware());
 * ใช้ตอน logout:  res.clearCookie(COOKIE_NAME, { path: '/' });
 * =============================================================================
 */
require('dotenv').config();
const session = require('express-session');

// -----------------------------------------------------------------------------
// ชื่อ Cookie ที่เบราว์เซอร์เก็บ (ดูได้ใน DevTools > Application > Cookies)
// ต้องใช้ชื่อเดียวกันตอน logout ด้วย ไม่งั้นลบ session ไม่หมด
// -----------------------------------------------------------------------------
const COOKIE_NAME = (process.env.SESSION_COOKIE_NAME || 'emis.sid').trim() || 'emis.sid';

/**
 * รหัสลับ (secret) — ใช้ sign/encrypt ข้อมูล session ใน cookie
 * ถ้ารั่ว คนอื่นอาจปลอม session ได้ → production ต้องตั้งใน .env ยาวอย่างน้อย 16 ตัว
 */
function getSessionSecret() {
    const raw = process.env.SESSION_SECRET;
    const trimmed = raw ? String(raw).trim() : '';

    if (trimmed.length >= 16) {
        return trimmed;
    }

    // production ไม่ยอมรันโดยไม่มี secret (กันพลาด deploy แบบไม่ปลอดภัย)
    if (process.env.NODE_ENV === 'production') {
        throw new Error(
            '[emis] SESSION_SECRET is required in production (at least 16 characters). Set it in .env'
        );
    }

    // development เท่านั้น: ใช้ค่า default ชั่วคราว + เตือนใน console
    console.warn(
        '[emis] SESSION_SECRET missing or too short; using insecure development default. Set SESSION_SECRET in .env'
    );
    return 'emis-dev-session-secret-not-for-production';
}

/**
 * อายุ session เป็นมิลลิวินาที (express-session ใช้หน่วย ms)
 * อ่าน SESSION_MAX_MINUTES จาก .env — ถ้าไม่ใส่หรือผิดรูปแบบ → 30 นาที
 * จำกัดสูงสุด 14 วัน กันตั้งค่าผิดพลาดเป็นเดือนๆ
 */
function sessionMaxAgeMs() {
    const mins = parseInt(process.env.SESSION_MAX_MINUTES, 10);
    const maxMins = 60 * 24 * 14; // 14 วัน

    if (Number.isFinite(mins) && mins > 0 && mins <= maxMins) {
        return mins * 60 * 1000;
    }
    return 1000 * 60 * 30; // 30 นาที
}

/**
 * สร้าง middleware ของ express-session ให้ app.js เรียกใช้ครั้งเดียว
 * ทุก request หลัง middleware นี้จะมี req.session ให้ใช้ได้
 */
function createSessionMiddleware() {
    return session({
        // ชื่อ cookie ในเบราว์เซอร์ (ไม่ใช่ connect.sid แบบ default)
        name: COOKIE_NAME,

        // รหัสลับจาก .env — ห้าม hardcode ในโค้ด
        secret: getSessionSecret(),

        // ไม่บันทึก session ซ้ำทุก request ถ้าไม่มีการเปลี่ยนแปลง (ประหยัดทรัพยากร)
        resave: false,

        // ไม่สร้าง session ว่างให้คนที่ยังไม่ล็อกอิน (ลด cookie ขยะ)
        saveUninitialized: false,

        cookie: {
            // อายุ cookie — หมดเวลาแล้วต้องล็อกอินใหม่
            maxAge: sessionMaxAgeMs(),

            // true = JavaScript ในหน้าเว็บอ่าน cookie นี้ไม่ได้ (กัน XSS ขโมย session)
            httpOnly: true,

            // lax = ส่ง cookie เมื่อคลิกลิงก์ภายในไซต์ปกติ; ลดการส่งไปข้ามไซต์แบบไม่จำเป็น
            sameSite: 'lax',

            // auto = ใช้ Secure cookie เมื่อ request เป็น HTTPS
            // (ต้องมี app.set('trust proxy', true) + Nginx ส่ง X-Forwarded-Proto: https)
            secure: 'auto',

            // cookie ใช้ได้ทุก path ใต้โดเมน (เช่น /emis/... และ /...)
            path: '/',
        },
    });
}

module.exports = {
    createSessionMiddleware,
    COOKIE_NAME,
};
