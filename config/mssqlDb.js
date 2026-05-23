const sql = require('mssql');
require('dotenv').config(); // 🟢 โหลดค่าจากไฟล์ .env เข้าสู่ระบบ Node.js

// 1. นำค่าจาก .env มาประกอบร่างเป็น Configuration Object
const config = {
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    server: process.env.MSSQL_SERVER,
    database: process.env.MSSQL_DATABASE,
    // 🟢 ใส่ Port ตรงนี้ โดยใช้ Number() เพื่อแปลงจากข้อความใน .env ให้กลายเป็นตัวเลข
    port: Number(process.env.MSSQL_PORT || 1433), 
    options: {
        encrypt: false, // เปลี่ยนเป็น true หาก SQL Server ปลายทางบังคับใช้ SSL (เช่น Azure)
        trustServerCertificate: true, // ป้องกันการติดปัญหา Security Certificate บนเครื่องพัฒนา/เครื่องเทส
        enableArithAbort: true
    },
    pool: {
        max: 10, // จำนวนสายสูงสุดที่ยอมให้เชื่อมต่อพร้อมกัน (Connection Pool)
        min: 0,
        idleTimeoutMillis: 30000 // ตัดสายอัตโนมัติหากไม่มีการใช้งานเกิน 30 วินาที เพื่อประหยัดสเปก Server
    }
};

// 2. สร้าง Connection Pool หลัก
const mssqlPool = new sql.ConnectionPool(config);

// 3. ฟังก์ชันสำหรับเรียกใช้เชื่อมต่อ (พร้อมดักจับ Error ตั้งแต่ตอนเริ่มระบบ)
const connectMSSQL = async () => {
    try {
        await mssqlPool.connect(); // 🔴 จังหวะนี้แหละครับ!
        console.log('MSSQL Server Database Connected Successfully!');
        return mssqlPool;
    } catch (err) {
        console.error('❌ MSSQL Connection Failed Error:', err.message);
        process.exit(1); // หากต่อเบสหลักไม่ผ่าน ให้ระบบหยุดรันเพื่อป้องกันการค้างสะสม
    }
};

// ส่งออกทั้ง Pool (เอาไว้คีย์ Query) และ ฟังก์ชันสตาร์ทสาย (เอาไว้รันตอนเปิดแอปฯ ใน app.js)
module.exports = {
    mssqlPool,
    connectMSSQL
};