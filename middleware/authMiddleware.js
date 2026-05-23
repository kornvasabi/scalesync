const db = require('../config/db');
const baseUrl = require('../config/baseUrl');

const requireAuth = async (req, res, next) => {
    if (req.session && req.session.user) {
        try {
            const [users] = await db.query(
                'SELECT force_logout, expires_at FROM users WHERE id = ?', 
                [req.session.user.id]
            );

            if (users.length > 0) {
                const user = users[0];

                if (user.force_logout === 1) {
                    req.session.destroy();
                    return res.redirect(`${baseUrl}/?error=kicked`); 
                }

                if (user.expires_at) {
                    const now = new Date();
                    const expireTime = new Date(user.expires_at);

                    if (now > expireTime) {
                        req.session.destroy();
                        return res.redirect(`${baseUrl}/?error=expired`);
                    }
                }

                return next(); 
            }
        } catch (error) {
            console.error("Auth Middleware Error:", error);
            return res.redirect(`${baseUrl}/`);
        }
    }
    
    return res.redirect(`${baseUrl}/`);
};

module.exports = { requireAuth };