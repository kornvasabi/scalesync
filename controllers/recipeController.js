const db = require('../config/db');

// ============================================================
// showRecipeList — โหลดหน้าเว็บโครงเปล่า
// ============================================================
const showRecipeList = async (req, res) => {
    try {
        // ดึงรายการวัตถุดิบไปรอไว้ทำ Dropdown ให้เลือกตอนสร้างสูตร
        const [materials] = await db.query("SELECT id, name, usage_unit, avg_cost_per_usage_unit FROM materials ORDER BY name ASC");
        res.render('recipe_list', { title: 'จัดการสูตรอาหาร - สูตรคูณ', materials });
    } catch (error) {
        console.error("Error:", error);
        res.render('recipe_list', { title: 'จัดการสูตรอาหาร', materials: [] });
    }
};

// ============================================================
// getRecipesData — Server-Side DataTable (คำนวณต้นทุนแบบ Real-time)
// ============================================================
const getRecipesData = async (req, res) => {
    try {
        const draw = parseInt(req.body.draw) || 1;
        const start = parseInt(req.body.start) || 0;
        const length = parseInt(req.body.length) || 50;
        const keyword = (req.body.search?.value || '').trim();

        let whereClause = '';
        let searchParams = [];

        if (keyword) {
            whereClause = `WHERE r.name LIKE ?`;
            searchParams = [`%${keyword}%`];
        }

        // ใช้ SQL JOIN และ SUM คำนวณต้นทุนรวมของสูตรจากราคาวัตถุดิบล่าสุดทันที
        const baseSql = `
            FROM recipes r
            LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
            LEFT JOIN materials m ON ri.material_id = m.id
            ${whereClause}
            GROUP BY r.id
        `;

        const [
            [[{ recordsTotal }]],
            [[{ recordsFiltered }]],
            [rows]
        ] = await Promise.all([
            db.query(`SELECT COUNT(*) AS recordsTotal FROM recipes`),
            // สำหรับ Filtered ต้องนับจาก Subquery เพราะมี GROUP BY
            db.query(`SELECT COUNT(*) AS recordsFiltered FROM (SELECT r.id ${baseSql}) AS t`, searchParams),
            db.query(
                `SELECT r.id, r.name, r.base_yield_qty, r.base_yield_unit, r.default_selling_price,
                        IFNULL(SUM(ri.qty_required * m.avg_cost_per_usage_unit), 0) AS total_cost
                 ${baseSql}
                 ORDER BY r.id DESC
                 LIMIT ? OFFSET ?`,
                [...searchParams, length, start]
            )
        ]);

        res.json({ draw, recordsTotal, recordsFiltered, data: rows });
    } catch (error) {
        console.error("Error:", error);
        res.json({ draw: 1, recordsTotal: 0, recordsFiltered: 0, data: [] });
    }
};

// ============================================================
// addRecipe — เพิ่มสูตรอาหารพร้อมส่วนผสม (Bulk Insert - No Loops)
// ============================================================
const addRecipe = async (req, res) => {
    // การทำงานจะเป็น Transaction เพื่อความปลอดภัยของข้อมูล
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { name, base_yield_qty, base_yield_unit, default_selling_price, ingredients } = req.body;

        // 1. บันทึกข้อมูลหลักของสูตร
        const [recipeResult] = await connection.query(
            `INSERT INTO recipes (name, base_yield_qty, base_yield_unit, default_selling_price) VALUES (?, ?, ?, ?)`,
            [name, base_yield_qty, base_yield_unit, default_selling_price || 0]
        );
        const newRecipeId = recipeResult.insertId;

        // 2. จัดเตรียมข้อมูลส่วนผสมเพื่อทำ Bulk Insert (ลดภาระ Database ไม่ต้องยิง Insert ทีละแถว)
        if (ingredients && ingredients.length > 0) {
            // สมมติหน้าบ้านส่งเป็น Array Object: [{ material_id: 1, qty: 50 }, { material_id: 2, qty: 10 }]
            const ingredientValues = ingredients.map(ing => [
                newRecipeId, 
                ing.material_id, 
                ing.qty_required
            ]);

            // ยิง SQL ชุดเดียวจบ
            await connection.query(
                `INSERT INTO recipe_ingredients (recipe_id, material_id, qty_required) VALUES ?`,
                [ingredientValues]
            );
        }

        await connection.commit();
        res.json({ status: 'success', message: 'บันทึกสูตรอาหารเรียบร้อยแล้ว' });

    } catch (error) {
        await connection.rollback();
        console.error("addRecipe Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    } finally {
        connection.release();
    }
};
// ============================================================
// getRecipeIngredients — โหลดข้อมูลส่วนผสมของสูตรอาหาร (สำหรับปุ่ม View)
// URL: GET /api/recipes/ingredients/:id
// ============================================================
const getRecipeIngredients = async (req, res) => {
    try {
        const recipeId = req.params.id;

        // 1. ดึงข้อมูลหลักของสูตร
        const [[recipe]] = await db.query("SELECT name, base_yield_qty, base_yield_unit FROM recipes WHERE id = ?", [recipeId]);

        if (!recipe) {
            return res.json({ status: 'error', message: 'ไม่พบข้อมูลสูตรอาหาร' });
        }

        // 2. ดึงรายการส่วนผสม พร้อมคำนวณต้นทุนย่อยของแต่ละวัตถุดิบ
        const [ingredients] = await db.query(
            `SELECT 
                m.name AS material_name, 
                ri.qty_required, 
                m.usage_unit, 
                m.avg_cost_per_usage_unit,
                (ri.qty_required * m.avg_cost_per_usage_unit) AS item_cost
             FROM recipe_ingredients ri
             JOIN materials m ON ri.material_id = m.id
             WHERE ri.recipe_id = ?`,
            [recipeId]
        );

        res.json({ status: 'success', data: { recipe, ingredients } });

    } catch (error) {
        console.error("getRecipeIngredients Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาดในการดึงข้อมูลส่วนผสม' });
    }
};

// ============================================================
// deleteRecipe — ลบสูตรอาหาร (Cascade Delete)
// URL: POST /api/recipes/delete
// ============================================================
const deleteRecipe = async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.json({ status: 'error', message: 'ไม่ระบุรหัสสูตรอาหารที่ต้องการลบ' });
        }

        /* 💡 ข้อดีของ Foreign Key (ON DELETE CASCADE):
           เราสั่งลบแค่ที่ตาราง recipes แล้ว MariaDB จะทำการลบข้อมูลที่เชื่อมโยง
           ในตาราง recipe_ingredients ให้เราอัตโนมัติเลยครับ โค้ดเลยสั้นแค่นี้!
        */
        await db.query("DELETE FROM recipes WHERE id = ?", [id]);
        
        res.json({ status: 'success', message: 'ลบสูตรอาหารออกจากระบบเรียบร้อยแล้ว!' });

    } catch (error) {
        console.error("deleteRecipe Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาด ไม่สามารถลบสูตรอาหารได้' });
    }
};

module.exports = { 
    showRecipeList, 
    getRecipesData, 
    addRecipe,
    getRecipeIngredients,
    deleteRecipe          
};