const db = require('../config/db');

/** สีปุ่มเมนูด่วน (วนตามลำดับ) */
const QUICK_LINK_BTN_CLASSES = ['btn-primary', 'btn-success', 'btn-info', 'btn-warning', 'btn-secondary', 'btn-dark'];

/**
 * รวบรวมลิงก์จากเมนูที่ user มีสิทธิ์ (dynamicMenus) — ไม่รวม dashboard
 */
function buildQuickLinks(menuTree) {
    const links = [];
    const seen = new Set();

    function pushMenu(menu) {
        if (!menu || !menu.link || menu.link === '#') return;
        const path = '/' + String(menu.link).replace(/\.php$/i, '');
        if (path === '/dashboard' || seen.has(path)) return;
        seen.add(path);
        links.push({
            path,
            name: menu.menu_name,
            icon: menu.icon || 'fas fa-external-link-alt',
        });
    }

    (menuTree || []).forEach((parent) => {
        if (parent.children && parent.children.length > 0) {
            parent.children.forEach(pushMenu);
        } else {
            pushMenu(parent);
        }
    });

    return links.slice(0, 8).map((item, i) => ({
        ...item,
        btnClass: QUICK_LINK_BTN_CLASSES[i % QUICK_LINK_BTN_CLASSES.length],
    }));
}

/**
 * การ์ดตัวเลขจริง — เฉพาะเมนูที่ user เข้าถึงได้ (เฟส 1: users / branches)
 */
async function fetchDashboardStats(allowedUrls) {
    const stats = [];

    if (allowedUrls.includes('/user_list')) {
        const [rows] = await db.query('SELECT COUNT(*) AS total FROM users');
        stats.push({
            key: 'users',
            border: 'primary',
            icon: 'fa-users',
            total: rows[0].total,
        });
    }

    if (allowedUrls.includes('/branches')) {
        const [rows] = await db.query(
            'SELECT COUNT(*) AS total FROM branches WHERE is_active = 1'
        );
        stats.push({
            key: 'branches',
            border: 'success',
            icon: 'fa-store',
            total: rows[0].total,
        });
    }

    return stats;
}

exports.showDashboard = async (req, res) => {
    try {
        const allowedUrls = res.locals.allowedUrls || [];
        const quickLinks = buildQuickLinks(res.locals.dynamicMenus);
        const stats = await fetchDashboardStats(allowedUrls);
        const canReport = allowedUrls.includes('/report_issues');

        res.render('dashboard', {
            title: req.__('dashboard.page_title'),
            quickLinks,
            stats,
            canReport,
        });
    } catch (error) {
        console.error('Dashboard Error:', error);
        res.render('dashboard', {
            title: req.__('dashboard.page_title'),
            quickLinks: buildQuickLinks(res.locals.dynamicMenus),
            stats: [],
            canReport: false,
        });
    }
};
