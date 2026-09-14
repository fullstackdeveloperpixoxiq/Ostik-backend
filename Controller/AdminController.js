const User = require("../models/UserSchema");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const adminLogin = async (req, res) => {
    try {

        const { email, password } = req.body;

        // 1. Validate input
        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        // 2. Find admin
        const admin = await User.findOne({
            email: email.toLowerCase(),
            role: "admin"
        });

        if (!admin) {
            return res.status(401).json({
                message: "Invalid admin credentials"
            });
        }

        // 3. Check active status
        if (!admin.isActive) {
            return res.status(403).json({
                message: "Admin account is inactive"
            });
        }

        // 4. Compare password
        const isPasswordMatch = await bcrypt.compare(
            password,
            admin.password
        );

        if (!isPasswordMatch) {
            return res.status(401).json({
                message: "Invalid admin credentials"
            });
        }

        // 5. Create JWT
        const token = jwt.sign(
            {
                id: admin._id,
                email: admin.email,
                role: admin.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "1d"
            }
        );

        // 6. Response
        return res.status(200).json({
            message: "Admin login successful",
            token,
            admin: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                role: admin.role
            }
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};

module.exports = {adminLogin};