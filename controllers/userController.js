// ไฟล์: controllers/userController.js
const db      = require('../config/db');
const bcrypt  = require('bcryptjs');

// ============================================================
// showUserList — โหลดหน้าเว็บ (ไม่ต้อง query users แล้ว
// เพราะตารางโหลดผ่าน AJAX server-side แทน)
// ============================================================
const showUserList = async (req, res) => {
    try {
        // ดึงแค่ Master Data สำหรับ Dropdown (ข้อมูลน้อย โหลดไวมาก)
        const [[groups], [branches], [departments]] = await Promise.all([
            db.query("SELECT id, group_name FROM user_groups ORDER BY id"),
            db.query("SELECT id, branch_code, branch_name FROM branches ORDER BY id"),
            db.query("SELECT id, dept_name FROM departments ORDER BY id")
        ]);

        res.render('user_list', {
            title:       'จัดการผู้ใช้งาน - Myproject_ww',
            groups,
            branches,
            departments
            // ไม่ส่ง users แล้ว — DataTable ดึงเองผ่าน /api/users_data
        });

    } catch (error) {
        console.error("showUserList Error:", error);
        res.render('user_list', {
            title: 'จัดการผู้ใช้งาน - Myproject_ww',
            groups: [], branches: [], departments: []
        });
    }
};

// ============================================================
// getUsersData — Server-Side DataTable API
// รับ: draw, start, length, search[value]
// ส่ง: { draw, recordsTotal, recordsFiltered, data }
// ============================================================
const getUsersData = async (req, res) => {
    try {
        const draw    = parseInt(req.body.draw)   || 1;
        const start   = parseInt(req.body.start)  || 0;
        const length  = parseInt(req.body.length) || 50;
        const keyword = (req.body.search?.value || '').trim();

        // ── Build WHERE clause ────────────────────────────────
        let whereClause  = '';
        let searchParams = [];

        if (keyword) {
            whereClause  = `WHERE (u.username LIKE ? OR u.fullname LIKE ?)`;
            searchParams = [`%${keyword}%`, `%${keyword}%`];
        }

        // ── Base SQL ──────────────────────────────────────────
        const baseSql = `
            FROM users u
            LEFT JOIN user_groups  g ON u.group_id  = g.id
            LEFT JOIN branches     b ON u.branch_id  = b.id
            LEFT JOIN departments  d ON u.dept_id    = d.id
            ${whereClause}
        `;

        // ── รัน 3 query พร้อมกัน ─────────────────────────────
        const [
            [[{ recordsTotal }]],
            [[{ recordsFiltered }]],
            [rows]
        ] = await Promise.all([
            db.query(`SELECT COUNT(*) AS recordsTotal FROM users u`),
            db.query(`SELECT COUNT(*) AS recordsFiltered ${baseSql}`, searchParams),
            db.query(
                `SELECT u.id, u.username, u.fullname, u.force_logout, u.expires_at,
                        g.group_name, b.branch_name, d.dept_name
                 ${baseSql}
                 ORDER BY u.id ASC
                 LIMIT ? OFFSET ?`,
                [...searchParams, length, start]
            )
        ]);

        res.json({ draw, recordsTotal, recordsFiltered, data: rows });

    } catch (error) {
        console.error("getUsersData Error:", error);
        res.json({ draw: 1, recordsTotal: 0, recordsFiltered: 0, data: [] });
    }
};

// ============================================================
// addUser — เพิ่มผู้ใช้ใหม่
// ============================================================
const addUser = async (req, res) => {
    try {
        const { username, password, fullname, group_id, branch_id, dept_id, accessible_branches, expires_at } = req.body;

        if (!username || !password || !fullname) {
            return res.json({ status: 'error', message: 'กรุณากรอก Username, Password และชื่อ-นามสกุลให้ครบถ้วนครับ' });
        }

        const paramExpiresAt = (expires_at && expires_at.trim() !== '') ? expires_at : null;
        const g_id = group_id  || null;
        const b_id = branch_id || null;
        const d_id = dept_id   || null;

        const salt           = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const [result] = await db.query(
            `INSERT INTO users (username, password, fullname, group_id, branch_id, dept_id, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [username, hashedPassword, fullname, g_id, b_id, d_id, paramExpiresAt]
        );

        const newUserId = result.insertId;

        if (accessible_branches) {
            const branchesArray = Array.isArray(accessible_branches) ? accessible_branches : [accessible_branches];
            await Promise.all(
                branchesArray.map(acc_b_id =>
                    db.query("INSERT INTO user_branches (user_id, branch_id) VALUES (?, ?)", [newUserId, acc_b_id])
                )
            );
        }

        const [[newUser]] = await db.query(
            `SELECT u.*, g.group_name, b.branch_name, d.dept_name
             FROM users u
             LEFT JOIN user_groups  g ON u.group_id  = g.id
             LEFT JOIN branches     b ON u.branch_id  = b.id
             LEFT JOIN departments  d ON u.dept_id    = d.id
             WHERE u.id = ?`,
            [newUserId]
        );

        res.json({ status: 'success', message: 'เพิ่มผู้ใช้งานและกำหนดสิทธิ์สาขาเรียบร้อยแล้ว!', data: newUser });

    } catch (error) {
        console.error("addUser Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลครับ' });
    }
};

// ============================================================
// getUser — โหลดข้อมูลขึ้นฟอร์มแก้ไข
// ============================================================
const getUser = async (req, res) => {
    try {
        const userId = req.params.id;

        const [[user], [mapped]] = await Promise.all([
            db.query("SELECT * FROM users WHERE id = ?", [userId]),
            db.query("SELECT branch_id FROM user_branches WHERE user_id = ?", [userId])
        ]);

        if (!user.length) {
            return res.json({ status: 'error', message: 'ไม่พบข้อมูลผู้ใช้งานในระบบ' });
        }

        const mappedBranches = mapped.map(m => m.branch_id);
        res.json({ status: 'success', data: user[0], mapped_branches: mappedBranches });

    } catch (error) {
        console.error("getUser Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
};

// ============================================================
// updateUser — อัปเดตข้อมูลผู้ใช้
// ============================================================
const updateUser = async (req, res) => {
    try {
        const { id, password, fullname, group_id, branch_id, dept_id, force_logout, accessible_branches, expires_at } = req.body;

        const paramExpiresAt = (expires_at && expires_at.trim() !== '') ? expires_at : null;
        const g_id = group_id  || null;
        const b_id = branch_id || null;
        const d_id = dept_id   || null;

        if (password) {
            const [[userRow]] = await db.query('SELECT username FROM users WHERE id = ?', [id]);
            if (!userRow) return res.status(404).json({ error: 'ไม่พบ user นี้ในระบบ' });

            const combined       = `${password}_${userRow.username}`;
            const hashedPassword = await bcrypt.hash(combined, 10);

            await db.query(
                `UPDATE users SET password=?, fullname=?, group_id=?, branch_id=?, dept_id=?, force_logout=?, expires_at=? WHERE id=?`,
                [hashedPassword, fullname, g_id, b_id, d_id, force_logout, paramExpiresAt, id]
            );
        } else {
            await db.query(
                `UPDATE users SET fullname=?, group_id=?, branch_id=?, dept_id=?, force_logout=?, expires_at=? WHERE id=?`,
                [fullname, g_id, b_id, d_id, force_logout, paramExpiresAt, id]
            );
        }

        await db.query("DELETE FROM user_branches WHERE user_id = ?", [id]);
        if (accessible_branches) {
            const branchesArray = Array.isArray(accessible_branches) ? accessible_branches : [accessible_branches];
            await Promise.all(
                branchesArray.map(acc_b_id =>
                    db.query("INSERT INTO user_branches (user_id, branch_id) VALUES (?, ?)", [id, acc_b_id])
                )
            );
        }

        const [[updatedUser]] = await db.query(
            `SELECT u.*, g.group_name, b.branch_name, d.dept_name
             FROM users u
             LEFT JOIN user_groups  g ON u.group_id  = g.id
             LEFT JOIN branches     b ON u.branch_id  = b.id
             LEFT JOIN departments  d ON u.dept_id    = d.id
             WHERE u.id = ?`,
            [id]
        );

        res.json({ status: 'success', message: 'อัปเดตข้อมูลและสิทธิ์สาขาเรียบร้อยแล้ว!', data: updatedUser });

    } catch (error) {
        console.error("updateUser Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล' });
    }
};

// ============================================================
// deleteUser — ลบผู้ใช้
// ============================================================
const deleteUser = async (req, res) => {
    try {
        const { id } = req.body;

        if (id == 1) {
            return res.json({ status: 'error', message: 'ไม่อนุญาตให้ลบ Super Admin ออกจากระบบครับ!' });
        }

        await db.query("DELETE FROM users WHERE id = ?", [id]);
        res.json({ status: 'success', message: 'ลบข้อมูลผู้ใช้งานออกจากระบบเรียบร้อยแล้ว!' });

    } catch (error) {
        console.error("deleteUser Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาด ไม่สามารถลบข้อมูลได้' });
    }
};

module.exports = { showUserList, getUsersData, addUser, getUser, updateUser, deleteUser };
