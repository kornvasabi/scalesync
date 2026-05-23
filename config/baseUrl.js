/**
 * แหล่งเดียวสำหรับ Base Path ของแอป (prefix URL ใต้ reverse proxy)
 * ตั้งค่าใน .env: BASE_URL=/emis  (เว้นว่างถ้ารันที่ root)
 */
require('dotenv').config();

function normalizeBaseUrl(url) {
    if (!url || url === '/') return '';
    return String(url).replace(/\/+$/, '');
}

module.exports = normalizeBaseUrl(process.env.BASE_URL || '');
