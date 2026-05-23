// 1. เลื่อนไปด้านบนของ app.js แอดบรรทัดนี้เพิ่มเข้าไปร่วมกับตัวอื่นๆ
const { connectMSSQL } = require('./config/mssqlDb');

// 1. 🟢 โหลด dotenv เป็นบรรทัดแรกสุดของไฟล์เลยครับ (สำคัญมาก!)
require('dotenv').config();

// 🟢 2. Base Path แหล่งเดียวจาก config/baseUrl.js (อ่าน BASE_URL จาก .env)
const baseUrl = require('./config/baseUrl');

// โหลดเครื่องมือที่ติดตั้งไว้
const express = require('express');
const { createSessionMiddleware } = require('./config/session');
const favicon = require('serve-favicon');
const path = require('path');
const app = express();

const { requireAuth } = require('./middleware/authMiddleware');
const { loadMenus, checkPermission } = require('./middleware/menuMiddleware');
const userController = require('./controllers/userController');
const multer = require('multer');
const branchController = require('./controllers/branchController'); 
const dashboardController = require('./controllers/dashboardController');

// 🟢 3. โยน baseUrl เข้า app.locals เพื่อให้ทุกหน้า EJS เอาไปใช้ได้
app.locals.baseUrl = baseUrl;

// 🚀 นำโค้ดนี้ไปวางไว้บนๆ (ก่อนถึงพวก app.use(express.static...))
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

// 1. ตั้งค่าหน้าตาเว็บ (View Engine)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 🚀 สั่งให้ Express.js ไว้ใจ Proxy (Nginx) และยอมรับ IP ที่ถูกส่งต่อมา
app.set('trust proxy', true);

// 2. บอกให้ Node รู้ว่าไฟล์นิ่งๆ (Static) อยู่ในโฟลเดอร์ public
app.use(express.static(path.join(__dirname, 'public')));

// 🟢 4. แก้ Static File Path ให้ใช้ baseUrl แบบไดนามิก
app.use(baseUrl, express.static(path.join(__dirname, 'public')));
app.use(`${baseUrl}/public`, express.static(path.join(__dirname, 'public')));

// 3. ตั้งค่าให้รับข้อมูลจากฟอร์ม Login ได้ (POST body)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 4. ตั้งค่าระบบ Session (secret / cookie อ่านจาก .env — ดู config/session.js)
app.use(createSessionMiddleware());

// ใส่ไว้ใต้โค้ดตั้งค่า session (...)
app.use((req, res, next) => {
    // 🚀 โยนข้อมูล user ใน session เข้า res.locals
    res.locals.user = req.session.user || null; 
    next();
});

app.use((req, res, next) => {
    // 🟢 5. ตัด baseUrl ออกจาก URL เสมอ เพื่อให้ Sidebar เช็ค Active ได้เป๊ะ!
    let normalizedPath = req.path.replace(baseUrl, '');
    if (normalizedPath === '') normalizedPath = '/';
    
    // แอบแนบ URL ปัจจุบัน (เช่น '/user_list') ไปให้ Sidebar เช็ค Active
    res.locals.currentPath = normalizedPath; 
    
    next(); 
});

app.use((req, res, next) => {
    res.locals.session = req.session; 
    next();
});

const i18n = require('i18n');

// 🟢 1. ตั้งค่า i18n
i18n.configure({
    locales: ['th', 'en'], 
    directory: path.join(__dirname, 'locales'), 
    defaultLocale: 'th', 
    objectNotation: true, 
    autoReload: true 
});

// 🟢 2. ให้ Express รู้จัก i18n
app.use(i18n.init);

// 🟢 3. ดักจับ Session เพื่อให้ระบบจำได้ว่า User คนนี้เลือกภาษาอะไรไว้
app.use((req, res, next) => {
    const currentLang = (req.session && req.session.lang) ? req.session.lang : 'th';
    res.setLocale(currentLang); 
    res.locals.currentLang = currentLang; 
    next();
});

const appRouter = express.Router();

// ==========================================
// 🟢 API สำหรับกดสลับภาษา
// ==========================================
appRouter.get('/change-lang/:lang', (req, res) => {
    const lang = req.params.lang;
    if (['th', 'en'].includes(lang)) {
        req.session.lang = lang; 
        req.session.save((err) => {
            if (err) console.error("Session Save Error:", err);
            res.json({ status: 'success' });
        });
    } else {
        res.redirect('back');
    }
});
// ==========================================

const authRoutes = require('./routes/authRoutes');
appRouter.use('/auth', authRoutes);

// ข้อความแจ้งเตือนหน้า login จาก ?error=expired|kicked (หลัง requireAuth เตะออก)
function getLoginAlertFromQuery(req) {
    const code = req.query.error;
    if (code === 'expired') {
        return {
            icon: 'warning',
            title: req.__('auth.expired_title'),
            text: req.__('auth.expired_text'),
            confirmButtonText: req.__('action.confirm'),
        };
    }
    if (code === 'kicked') {
        return {
            icon: 'error',
            title: req.__('auth.kicked_title'),
            text: req.__('auth.kicked_text'),
            confirmButtonText: req.__('action.confirm'),
        };
    }
    return null;
}
// 🔒 เส้นทางสำหรับกดทดสอบ Sync ข้อมูล (แนะนำให้ซ่อนหรือเปิดเฉพาะสิทธิ์ Admin)
appRouter.get('/api/internal/test-sync-users', /*requireAuth,*/ async (req, res) => {
    try {
        // ดึงบริการ Sync ที่เราเขียนแยกไฟล์ไว้มาสั่งรันสดๆ ตรงนี้
        const { startSyncUsersJob } = require('./services/syncUserService');
        
        console.log('[Manual Test] ผู้ใช้สั่งรันระบบ Sync ด้วยตนเอง...');
        await startSyncUsersJob();
        
        res.json({ status: 'success', message: 'สั่งรัน Sync Job สำเร็จแล้ว! รบกวนตรวจสอบผลลัพธ์ใน Console หรือตาราง sync_users' });
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// 5. ตัวอย่าง Route หน้า Login
appRouter.get('/', (req, res) => {
    if (req.session && req.session.user) {
        // 🟢 6. ใช้ baseUrl ในการ Redirect
        return res.redirect(`${baseUrl}/dashboard`);
    }
    res.render('login', {
        error: null,
        loginAlert: getLoginAlertFromQuery(req),
    });
});

// หน้า Dashboard
appRouter.get('/dashboard', requireAuth, loadMenus, dashboardController.showDashboard);

// 🟢 หน้าตั้งค่ากลุ่มผู้ใช้
appRouter.get('/user_list', requireAuth, loadMenus, checkPermission, userController.showUserList);
appRouter.post('/api/add_user', requireAuth, userController.addUser);
appRouter.get('/api/get_user/:id', requireAuth, userController.getUser);
appRouter.post('/api/update_user', requireAuth, userController.updateUser);
appRouter.post('/api/delete_user', requireAuth, userController.deleteUser);
appRouter.post('/api/users_data', requireAuth, userController.getUsersData);

// ระบบจัดการสาขา
appRouter.get('/branches', requireAuth, loadMenus, checkPermission, branchController.branchPage);
appRouter.get('/api/branches', requireAuth, branchController.getBranches);
appRouter.post('/api/branches/add', requireAuth, branchController.addBranch);
appRouter.post('/api/branches/update/:id', requireAuth, branchController.updateBranch);
appRouter.post('/api/branches/delete/:id', requireAuth, branchController.deleteBranch);

app.use('/', appRouter);               // ประตูที่ 1: สำหรับ Nginx (9090) ที่โดนตัด URL ไปแล้ว
// 🟢 7. ผูก Router เข้ากับ baseUrl แบบไดนามิก
app.use(baseUrl || '/', appRouter);    // ประตูที่ 2: สำหรับเข้าพอร์ตตรงๆ

// =========================================================================
// 🟢 Middleware ดักจับ 404 Not Found (ปรับปรุงใหม่ รองรับ WSL)
// =========================================================================
app.use((req, res, next) => {
    // 2. เช็คว่ามี Session (ล็อกอินอยู่) หรือไม่ เพื่อหาเป้าหมายปลายทาง
    // ถ้าล็อกอินอยู่ -> ไป Dashboard | ถ้ายังไม่ล็อกอิน -> ไปหน้า Login (หน้าแรก)
    const targetUrl = (req.session && req.session.user) ? `${baseUrl}/dashboard` : `${baseUrl}/`;

    res.status(404).send(`
        <!DOCTYPE html>
        <html lang="th">
        <head>
            <meta charset="utf-8">
            <title>404 Not Found</title>
            <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
            <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
            <style>
                body { background-color: #f8f9fc; font-family: 'Kanit', sans-serif; }
            </style>
        </head>
        <body>
            <script>
                Swal.fire({
                    title: 'ไม่พบหน้าเว็บ / กำลังพัฒนา 🚧',
                    text: 'ฟังก์ชันนี้กำลังอยู่ระหว่างการพัฒนา หรือไม่มีหน้านี้ในระบบครับ',
                    icon: 'info',
                    confirmButtonText: 'ตกลง',
                    confirmButtonColor: '#f6c23e',
                    allowOutsideClick: false
                }).then((result) => {
                    if (result.isConfirmed) {
                        // 🟢 3. เด้งไปหน้าปลายทางที่คำนวณไว้ข้างต้น
                        window.location.href = '${targetUrl}';
                    }
                });
            </script>
        </body>
        </html>
    `);
});

// 6. รันที่พอร์ต 7000 (หรือตามที่คุณกรกำหนด)
const PORT = process.env.PORT || 3000; // สามารถดึงจาก .env ได้ด้วยนะครับ
app.listen(PORT, () => {
    console.log(`-------------------------------------------`);
    console.log(`🚀 Myproject_nodejs start at PORT: ${PORT}`);
    console.log(`🌐 Base URL is set to: "${baseUrl}"`);
    console.log(`-------------------------------------------`);
});
