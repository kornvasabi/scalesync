const db = require('../config/db');

// โหลดหน้าเว็บ
const showMaterialList = async (req, res) => {
    try {
        res.render('material_list', { title: 'จัดการวัตถุดิบ - สูตรคูณ' });
    } catch (error) {
        console.error("Error:", error);
        res.render('material_list', { title: 'จัดการวัตถุดิบ' });
    }
};

// ดึงข้อมูลเข้า DataTables
const getMaterialsData = async (req, res) => {
    try {
        const draw = parseInt(req.body.draw) || 1;
        const start = parseInt(req.body.start) || 0;
        const length = parseInt(req.body.length) || 50;
        const keyword = (req.body.search?.value || '').trim();

        let whereClause = '';
        let searchParams = [];

        if (keyword) {
            whereClause = `WHERE name LIKE ?`;
            searchParams = [`%${keyword}%`];
        }

        const baseSql = `FROM materials ${whereClause}`;

        const [
            [[{ recordsTotal }]],
            [[{ recordsFiltered }]],
            [rows]
        ] = await Promise.all([
            db.query(`SELECT COUNT(*) AS recordsTotal FROM materials`),
            db.query(`SELECT COUNT(*) AS recordsFiltered ${baseSql}`, searchParams),
            db.query(
                `SELECT * ${baseSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
                [...searchParams, length, start]
            )
        ]);

        res.json({ draw, recordsTotal, recordsFiltered, data: rows });
    } catch (error) {
        console.error("Error:", error);
        res.json({ draw: 1, recordsTotal: 0, recordsFiltered: 0, data: [] });
    }
};

// เพิ่มวัตถุดิบ
const addMaterial = async (req, res) => {
    try {
        const { name, purchase_unit, usage_unit, conversion_factor, yield_percent } = req.body;
        const yieldVal = yield_percent || 100.00; // ถ้าไม่กรอก ให้ถือว่าใช้ได้ 100% ไม่มีของเสีย

        await db.query(
            `INSERT INTO materials (name, purchase_unit, usage_unit, conversion_factor, yield_percent)
             VALUES (?, ?, ?, ?, ?)`,
            [name, purchase_unit, usage_unit, conversion_factor, yieldVal]
        );

        res.json({ status: 'success', message: 'เพิ่มวัตถุดิบเรียบร้อยแล้ว' });
    } catch (error) {
        console.error("Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาดในการบันทึก' });
    }
};

// ============================================================
// 🌟 ไฮไลท์สำคัญ: บันทึกการซื้อและคำนวณต้นทุน (Purchase Log & Cost Calculation)
// ============================================================
const addPurchaseLog = async (req, res) => {
    try {
        const { material_id, purchase_date, qty_purchased, total_price } = req.body;

        // 1. ดึงข้อมูลวัตถุดิบ เพื่อเอาตัวคูณ (Conversion) และ เปอร์เซ็นต์ของเสีย (Yield)
        const [[material]] = await db.query('SELECT conversion_factor, yield_percent FROM materials WHERE id = ?', [material_id]);
        
        if (!material) {
            return res.json({ status: 'error', message: 'ไม่พบข้อมูลวัตถุดิบ' });
        }

        /* 💡 อธิบาย Logic การคำนวณแบบจำง่ายๆ:
           สมมติ: ซื้อหมึกสด 1 kg (qty_purchased = 1), จ่ายเงิน 200 บาท (total_price = 200)
           Conversion = 1000 (1 kg = 1000 g), Yield = 80% (ทำความสะอาดแล้วเหลือ 80%)

           สเตปที่ 1 หาปริมาณที่ใช้ได้จริงก่อน:
           1 kg * 1000 = 1000 กรัม -> หักของเสีย 20% (คูณ 80/100) = เหลือใช้จริง 800 กรัม
        */
        const actual_usage_qty = parseFloat(qty_purchased) * parseFloat(material.conversion_factor) * (parseFloat(material.yield_percent) / 100);

        /*
           สเตปที่ 2 หาต้นทุนต่อหน่วยที่ใช้ทำสูตร:
           จ่ายไป 200 บาท / ได้ของมา 800 กรัม = ตกกรัมละ 0.25 บาท
        */
        const unit_cost_log = parseFloat(total_price) / actual_usage_qty;

        // 2. บันทึกประวัติการซื้อลงตาราง purchase_logs
        await db.query(
            `INSERT INTO purchase_logs (material_id, purchase_date, qty_purchased, total_price, unit_cost_log)
             VALUES (?, ?, ?, ?, ?)`,
            [material_id, purchase_date, qty_purchased, total_price, unit_cost_log]
        );

        // 3. อัปเดตราคาต้นทุนล่าสุด กลับไปที่ตาราง materials
        // ระบบสูตรจะดึงราคานี้ไปใช้คำนวณกำไร
        await db.query(
            `UPDATE materials SET avg_cost_per_usage_unit = ? WHERE id = ?`,
            [unit_cost_log, material_id]
        );

        res.json({ status: 'success', message: 'บันทึกการซื้อและอัปเดตต้นทุนสำเร็จ' });
    } catch (error) {
        console.error("Error:", error);
        res.json({ status: 'error', message: 'บันทึกประวัติการซื้อล้มเหลว' });
    }
};

// ============================================================
// getMaterial — โหลดข้อมูลวัตถุดิบ 1 รายการขึ้นฟอร์มแก้ไข
// URL: GET /api/materials/get/:id
// ============================================================
const getMaterial = async (req, res) => {
    try {
        const matId = req.params.id;

        // ใช้ Destructuring ดึงแถวแรกออกมาเหมือนสไตล์ที่คุณคุ้นเคย
        const [[material]] = await db.query("SELECT * FROM materials WHERE id = ?", [matId]);

        if (!material) {
            return res.json({ status: 'error', message: 'ไม่พบข้อมูลวัตถุดิบในระบบ' });
        }

        res.json({ status: 'success', data: material });

    } catch (error) {
        console.error("getMaterial Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
};

// ============================================================
// updateMaterial — อัปเดตข้อมูลวัตถุดิบ
// URL: POST /api/materials/update
// ============================================================
const updateMaterial = async (req, res) => {
    try {
        const { id, name, purchase_unit, usage_unit, conversion_factor, yield_percent } = req.body;

        if (!id || !name || !purchase_unit || !usage_unit || !conversion_factor) {
            return res.json({ status: 'error', message: 'กรุณากรอกข้อมูลสำคัญให้ครบถ้วนครับ' });
        }

        const yieldVal = yield_percent || 100.00;

        // อัปเดตข้อมูลพื้นฐาน (ไม่รวมต้นทุนเฉลี่ย เพราะต้นทุนจะเปลี่ยนเมื่อบันทึกการซื้อจริงเท่านั้น)
        await db.query(
            `UPDATE materials 
             SET name = ?, purchase_unit = ?, usage_unit = ?, conversion_factor = ?, yield_percent = ? 
             WHERE id = ?`,
            [name, purchase_unit, usage_unit, conversion_factor, yieldVal, id]
        );

        res.json({ status: 'success', message: 'อัปเดตข้อมูลวัตถุดิบเรียบร้อยแล้ว!' });

    } catch (error) {
        console.error("updateMaterial Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูลวัตถุดิบ' });
    }
};

// ============================================================
// deleteMaterial — ลบวัตถุดิบ
// URL: POST /api/materials/delete
// ============================================================
const deleteMaterial = async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.json({ status: 'error', message: 'ไม่ระบุรหัสวัตถุดิบที่ต้องการลบ' });
        }

        /* 🔒 จุดตรวจสอบความปลอดภัย (Data Integrity Check):
           ก่อนจะลบวัตถุดิบ ต้องเช็คก่อนว่าวัตถุดิบชิ้นนี้ถูกผูกอยู่กับ "สูตรอาหาร" ใดๆ ในตาราง recipe_ingredients หรือไม่
           เพื่อป้องกันปัญหา Foreign Key Error หรือทำให้สูตรอาหารที่เคยเขียนไว้ข้อมูลพัง (กำพร้าวัตถุดิบ)
        */
        const [[checkUsage]] = await db.query(
            "SELECT COUNT(*) AS count FROM recipe_ingredients WHERE material_id = ?", 
            [id]
        );

        if (checkUsage.count > 0) {
            return res.json({ 
                status: 'error', 
                message: 'ไม่สามารถลบได้ เนื่องจากวัตถุดิบนี้กำลังถูกใช้งานอยู่ในสูตรอาหาร กรุณาลบวัตถุดิบนี้ออกจากสูตรอาหารก่อนครับ' 
            });
        }

        // หากผ่านเงื่อนไข ไม่มีสูตรไหนเรียกใช้ ก็ทำการลบได้เลย
        await db.query("DELETE FROM materials WHERE id = ?", [id]);
        
        res.json({ status: 'success', message: 'ลบข้อมูลวัตถุดิบออกจากระบบเรียบร้อยแล้ว!' });

    } catch (error) {
        console.error("deleteMaterial Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาด ไม่สามารถลบข้อมูลวัตถุดิบได้' });
    }
};

// อย่าลืมเอาทั้ง 3 ฟังก์ชันนี้ใส่เพิ่มเข้าไปใน module.exports ด้านล่างสุดของไฟล์ด้วยนะครับ
module.exports = { 
    showMaterialList, 
    getMaterialsData, 
    addMaterial, 
    addPurchaseLog,
    getMaterial,      // <-- เพิ่มตัวนี้
    updateMaterial,   // <-- เพิ่มตัวนี้
    deleteMaterial    // <-- เพิ่มตัวนี้
};