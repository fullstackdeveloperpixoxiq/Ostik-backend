const AdminMiddleware = (req, res, next) => {
    try {

        // Check logged-in user's role
        if (req.user.role !== "admin") {
            return res.status(403).json({
                message: "Access denied. Admin only."
            });
        }

        next();

    } catch (err) {

        console.log(err);

        return res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};

module.exports = AdminMiddleware;