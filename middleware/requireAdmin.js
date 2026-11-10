const asyncHandler = require('../utils/asyncHandler');

module.exports = function createRequireAdmin({ sessionService }) {
  return asyncHandler(async (req, res, next) => {
    const token = sessionService.getCookie(req, 'session');
    if (!token) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

    const user = await sessionService.findSessionUser(token);
    if (!user) return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'คุณไม่มีสิทธิ์ใช้งานส่วนนี้' });

    req.authUser = user;
    return next();
  });
};
