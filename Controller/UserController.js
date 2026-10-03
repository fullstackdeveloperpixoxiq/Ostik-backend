const bcrypt= require("bcryptjs");
const UserSchema = require("../models/UserSchema");
const OtpSchema = require("../models/OtpSchema");
const nodeMailer= require("nodemailer");
const Jwt= require("jsonwebtoken");
const mongoose= require("mongoose");
const cloudinary= require("../Config/Cloudinary")
require("dotenv").config()

const RegiterUser = async (req, res) => {
    try {

        const { name, email, password } = req.body;

        // =====================================================
        // VALIDATION
        // =====================================================

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "All fields are required"
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const normalizedName = name.trim();

        // =====================================================
        // CHECK IF USER ALREADY EXISTS
        // =====================================================

        const existingUser = await UserSchema.findOne({
            email: normalizedEmail
        });

        if (existingUser) {

            // Already verified user
            if (existingUser.isEmailVerified) {
                return res.status(409).json({
                    message: "An account with this email already exists."
                });
            }

            // This handles old unverified users
            // created by your previous registration flow.
            return res.status(409).json({
                message: "An incomplete registration already exists for this email. Please contact support or remove the old unverified account."
            });
        }

        // =====================================================
        // CHECK EXISTING PENDING REGISTRATION
        // =====================================================

        await OtpSchema.updateMany(
            {
                email: normalizedEmail,
                purpose: "emailVerification",
                isUsed: false
            },
            {
                isUsed: true
            }
        );

        // =====================================================
        // HASH PASSWORD
        // =====================================================

        const hashedPassword = await bcrypt.hash(
            password,
            10
        );

        // =====================================================
        // GENERATE OTP
        // =====================================================

        const otp = Math.floor(
            100000 + Math.random() * 900000
        ).toString();

        console.log(
            "Registration OTP generated:",
            otp
        );

        // =====================================================
        // SAVE OTP + TEMPORARY REGISTRATION DATA
        // =====================================================

        const otpRecord = await OtpSchema.create({

            // No User exists yet
            user: undefined,

            email: normalizedEmail,

            otp,

            purpose: "emailVerification",

            expiresAt: new Date(
                Date.now() + 10 * 60 * 1000
            ),

            isUsed: false,

            registrationData: {
                name: normalizedName,
                password: hashedPassword
            }
        });

        console.log(
            "Registration OTP saved:",
            otpRecord._id.toString()
        );

        // =====================================================
        // CREATE EMAIL TRANSPORTER
        // =====================================================

        const transporter = nodeMailer.createTransport({

            service: "gmail",

            auth: {
                user: process.env.Email_User,
                pass: process.env.Email_Pass
            },

            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 10000
        });

        console.log(
            "Attempting to send registration OTP to:",
            normalizedEmail
        );

        // =====================================================
        // SEND OTP
        // =====================================================

        const mailInfo = await transporter.sendMail({

            from: process.env.Email_User,

            to: normalizedEmail,

            subject: "Your OSTIK Email Verification OTP",

            text: `Your OSTIK verification OTP is ${otp}.

This OTP is valid for 10 minutes.

For your security, do not share this OTP with anyone.

If you did not request this OTP, please ignore this email.`
        });

        console.log(
            "OTP email sent successfully:",
            mailInfo.messageId
        );

        // =====================================================
        // SUCCESS
        // =====================================================

        return res.status(201).json({

            message:
                "Registration successful. OTP sent to your email.",

            registrationId: otpRecord._id
        });

    } catch (error) {

        console.error(
            "REGISTRATION ERROR:",
            error
        );

        return res.status(500).json({

            message:
                "Unable to send verification email. Please try again."
        });
    }
};

const VerifyOTP = async (req, res) => {

    try {

        const { registrationId, otp } = req.body;

        // =====================================================
        // VALIDATION
        // =====================================================

        if (!registrationId || !otp) {
            return res.status(400).json({
                message: "Registration ID and OTP are required"
            });
        }

        // =====================================================
        // FIND OTP RECORD
        // =====================================================

        const otpRecord = await OtpSchema.findOne({
            _id: registrationId,
            otp: otp,
            purpose: "emailVerification",
            isUsed: false
        });

        if (!otpRecord) {
            return res.status(400).json({
                message: "Invalid or already used OTP"
            });
        }

        // =====================================================
        // CHECK OTP EXPIRATION
        // =====================================================

        if (otpRecord.expiresAt < new Date()) {

            return res.status(400).json({
                message: "OTP has expired"
            });
        }

        // =====================================================
        // CHECK REGISTRATION DATA
        // =====================================================

        if (
            !otpRecord.registrationData ||
            !otpRecord.registrationData.name ||
            !otpRecord.registrationData.password
        ) {

            return res.status(400).json({
                message: "Registration data not found. Please register again."
            });
        }

        // =====================================================
        // CHECK IF USER WAS CREATED IN THE MEANTIME
        // =====================================================

        const existingUser = await UserSchema.findOne({
            email: otpRecord.email
        });

        if (existingUser) {

            return res.status(409).json({
                message: "An account with this email already exists."
            });
        }

        // =====================================================
        // CREATE USER ONLY AFTER OTP VERIFICATION
        // =====================================================

        const user = await UserSchema.create({

            name: otpRecord.registrationData.name,

            email: otpRecord.email,

            password: otpRecord.registrationData.password,

            role: "user",

            isEmailVerified: true,

            isActive: true
        });

        console.log(
            "User created after OTP verification:",
            user._id.toString()
        );

        // =====================================================
        // MARK OTP AS USED
        // =====================================================

        otpRecord.isUsed = true;

        await otpRecord.save();

        // =====================================================
        // SUCCESS
        // =====================================================

        return res.status(200).json({

            message: "Email verified successfully"
        });

    } catch (error) {

        console.error(
            "VERIFY OTP ERROR:",
            error
        );

        return res.status(500).json({
            message: "Server error"
        });
    }
};

const ResendOTP = async (req, res) => {

    try {

        const { registrationId } = req.body;

        // =====================================================
        // VALIDATION
        // =====================================================

        if (!registrationId) {
            return res.status(400).json({
                message: "Registration ID is required"
            });
        }

        // =====================================================
        // FIND EXISTING REGISTRATION OTP
        // =====================================================

        const existingOtp = await OtpSchema.findOne({
            _id: registrationId,
            purpose: "emailVerification"
        });

        if (!existingOtp) {

            return res.status(404).json({
                message: "Registration not found. Please register again."
            });
        }

        // =====================================================
        // CHECK IF ALREADY USED
        // =====================================================

        if (existingOtp.isUsed) {

            return res.status(400).json({
                message: "This registration has already been completed."
            });
        }

        // =====================================================
        // GENERATE NEW OTP
        // =====================================================

        const newOtp = Math.floor(
            100000 + Math.random() * 900000
        ).toString();

        console.log(
            "New registration OTP:",
            newOtp
        );

        // =====================================================
        // UPDATE OTP
        // =====================================================

        existingOtp.otp = newOtp;

        existingOtp.expiresAt = new Date(
            Date.now() + 10 * 60 * 1000
        );

        await existingOtp.save();

        // =====================================================
        // CREATE EMAIL TRANSPORTER
        // =====================================================

        const transporter = nodeMailer.createTransport({

            service: "gmail",

            auth: {
                user: process.env.Email_User,
                pass: process.env.Email_Pass
            },

            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 10000
        });

        // =====================================================
        // SEND OTP
        // =====================================================

        const mailInfo = await transporter.sendMail({

            from: process.env.Email_User,

            to: existingOtp.email,

            subject: "Your OSTIK Email Verification OTP",

            text: `Your OSTIK verification OTP is ${newOtp}.

This OTP is valid for 10 minutes.

For your security, do not share this OTP with anyone.

If you did not request this OTP, please ignore this email.`
        });

        console.log(
            "OTP email sent successfully:",
            mailInfo.messageId
        );

        // =====================================================
        // SUCCESS
        // =====================================================

        return res.status(200).json({

            message:
                "A new OTP has been sent to your email.",

            registrationId: existingOtp._id
        });

    } catch (error) {

        console.error(
            "RESEND OTP ERROR:",
            error
        );

        return res.status(500).json({
            message:
                "Unable to send OTP. Please try again."
        });
    }
};

const LoginUser= async (req,res)=>{
    try{
        const {email,password}= req.body;

        //required field
        if(!email || !password){
            return res.status(400).json({
                message:"All field are required"
            })
        };

        //find user
        const user= await UserSchema.findOne({email});

        if(!user){
            return res.status(404).json({
                message:"User not found."
            })
        }

        //check email verified
        if(!user.isEmailVerified){
            return res.status(401).json({
                message:"Please verify your email first"
            })
        };

         // 4. Check if account is active
        if (!user.isActive) {
            return res.status(403).json({
                message: "Your account is inactive"
            });
        };

        //compare password
        const comparePassword= await bcrypt.compare(
            password,
            user.password
        );

        if (!comparePassword) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        };

        //create Jwt token
        const token= Jwt.sign({
            userId: user._id,
            role: user.role
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "7d"
        }
    );

      // 7. Response
        res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                profileImage: user.profileImage
            }
        });
    
    }
    catch(error){
        console.log(error);

        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
}


const ForgotPassword= async(req,res)=>{
    try{
        const {email}= req.body;

        if(!email){
            return res.status(400).json({
                message: "Email is required"
            });
        }

        //find user
        const user= await UserSchema.findOne({email});

        if(!user){
            return res.status(404).json({
                message:"User not found"
            })
        };

        //Generate OTP
        const otp= Math.floor(100000 + Math.random() * 900000).toString();

        await OtpSchema.create({
            user: user._id,
            email: user.email,
            otp,
            purpose: "forgotPassword",
            expiresAt: new Date(Date.now() + 10*60*1000)
        });

        //create email transporter
        const transporter= nodeMailer.createTransport({
            service:"gmail",
            auth:{
                user: process.env.Email_User,
                pass: process.env.Email_Pass
            }
        });

        //send OTP
        await transporter.sendMail({
            from: process.env.Email_User,
            to: email,
            subject: "Password Reset OTP",
            text: `Your password reset OTP is ${otp}. It will expire in 10 minutes.`
        });

        res.status(200).json({
            message:"OTP send to your email",
            userId: user._id
        })
    }
    catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
}

const verifyForgotPasswordOTP= async (req,res)=>{
    try{
        const {userId,otp}= req.body;


        // 1. Check required fields
        if (!userId || !otp) {
            return res.status(400).json({
                message: "User ID and OTP are required"
            });
        };

        //find user
        const user= await UserSchema.findById(userId);

        if(!user){
            return res.status(404).json({
                message:"User not found"
            })
        };

        //find otp
        const otpRecord= await OtpSchema.findOne({
            user: userId,
            otp: otp,
            purpose: "forgotPassword",
            isUsed: false
        });

         if (!otpRecord) {
            return res.status(400).json({
                message: "Invalid or already used OTP"
            });
        }

        //check expiration
        if(otpRecord.expiresAt < new Date()){
            return res.status(400).json({
                message: "OTP has expired"
            });
        }

        //mark OTP as used
        otpRecord.isUsed= true
        await otpRecord.save();

        return res.status(200).json({
            message:"OTP verified successfully"
        })
    }
     catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
}


const ResetPassword= async (req,res)=>{
    try{
        const {userId, newpassword}= req.body;

        //all field are required
        if(!userId || !newpassword){
            return res.status(400).json({
                message:"All fields are required"
            })
        }

         // 2. Find user
        const user = await UserSchema.findById(userId);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        //hash new password
        const hashedPassword= await bcrypt.hash(
            newpassword, 10
        )

        //update password
        user.password = hashedPassword;

        await user.save();

        res.status(200).json({
            message: "Password reset successfully"
        });

    }
    catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
}


const ProtectedTest = async (req, res) => {
    try {
        res.status(200).json({
            message: "You are authenticated",
            user: req.user
        });

    } catch (error) {
        console.log(error);

        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};


const GetProfile = async (req, res) => {
    try {

        // Get logged-in user's ID from JWT
        const userId = req.user.userId;

        // Find user
        const user = await UserSchema.findById(userId)
            .select("-password");

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        res.status(200).json({
            message: "Profile fetched successfully",
            user
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};


const UpdateProfile = async (req, res) => {
    try {

        const userId = req.user.userId;

        const {
            name,
            country,
            preferredcurrency
        } = req.body;

        // Find user
        const user = await UserSchema.findById(userId);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        // Update name
        if (name !== undefined) {
            user.name = name.trim();
        }

        // Update country
        if (country !== undefined) {
            user.country = country;
        }

        // Update currency
        if (preferredcurrency !== undefined) {
            user.preferredcurrency = preferredcurrency;
        }

        //update profile image
        if(req.file){
             const uploadedImage = await new Promise(
                (resolve, reject) => {

                    const stream =
                        cloudinary.uploader.upload_stream(
                            {
                                folder: "ostik/profile",
                                resource_type: "image",
                            },

                            (error, result) => {

                                if (error) {
                                    reject(error);
                                } else {
                                    resolve(result);
                                }

                            }
                        );

                    stream.end(req.file.buffer);

                    }
            );

            // Save Cloudinary URL in MongoDB
            user.profileImage =
                uploadedImage.secure_url;
        
        }

        await user.save();

        res.status(200).json({
            message: "Profile updated successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                profileImage: user.profileImage,
                country: user.country,
                preferredcurrency: user.preferredcurrency
            }
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};

const AddAddress = async (req, res) => {
    try {
        const userId = req.user.userId;

        const {
            name,
            phone,
            email,
            address,
            city,
            pincode
        } = req.body;

        // Check required fields
        if (!name || !phone || !address || !city || !pincode) {
            return res.status(400).json({
                message: "All address fields are required"
            });
        }

        // Find user
        const user = await UserSchema.findById(userId);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        // Create address object
        const newAddress = {
            _id: new mongoose.Types.ObjectId(),
            name,
            phone,
            email: email || user.email,
            address,
            city,
            pincode
        };

        // Add address to user's addresses array
        user.addresses.push(newAddress);

        await user.save();

        res.status(201).json({
            message: "Address added successfully",
            address: newAddress
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};

const UpdateAddress = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { addressId } = req.params;

        const {
            name,
            phone,
            email,
            address,
            city,
            pincode
        } = req.body;

        const user = await UserSchema.findById(userId);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const existingAddress = user.addresses.id(addressId);

        if (!existingAddress) {
            return res.status(404).json({
                message: "Address not found"
            });
        }

        // Update only provided fields
        if (name !== undefined) existingAddress.name = name;
        if (phone !== undefined) existingAddress.phone = phone;
        if (email !== undefined) existingAddress.email = email;
        if (address !== undefined) existingAddress.address = address;
        if (city !== undefined) existingAddress.city = city;
        if (pincode !== undefined) existingAddress.pincode = pincode;

        await user.save();

        res.status(200).json({
            message: "Address updated successfully",
            address: existingAddress
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};



const DeleteAddress = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { addressId } = req.params;

        const user = await UserSchema.findById(userId);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const addressIndex = user.addresses.findIndex(
            address => address._id.toString() === addressId
        );

        if (addressIndex === -1) {
            return res.status(404).json({
                message: "Address not found"
            });
        }

        user.addresses.splice(addressIndex, 1);

        await user.save();

        res.status(200).json({
            message: "Address deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};


// =========================================================
// ADMIN - GET ALL CUSTOMERS
// =========================================================

const GetCustomers = async (req, res) => {
    try {

        const customers = await UserSchema.find({
            role: "user"
        })
            .select("-password")
            .sort({ createdAt: -1 });

        res.status(200).json({
            message: "Customers fetched successfully",
            customers
        });

    } catch (error) {

        console.log("Get customers error:", error);

        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};


// =========================================================
// ADMIN - GET SINGLE CUSTOMER
// =========================================================

const GetCustomer = async (req, res) => {
    try {

        const { id } = req.params;

        const customer = await UserSchema.findOne({
            _id: id,
            role: "user"
        }).select("-password");

        if (!customer) {
            return res.status(404).json({
                message: "Customer not found"
            });
        }

        res.status(200).json({
            message: "Customer fetched successfully",
            customer
        });

    } catch (error) {

        console.log("Get customer error:", error);

        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};


// =========================================================
// ADMIN - CREATE CUSTOMER
// =========================================================

const CreateCustomer = async (req, res) => {
    try {

        console.log("CUSTOMER BODY:", req.body);
        console.log("CUSTOMER FILE:", req.file);

        const {
            name,
            email,
            password,
            country,
            preferredcurrency,
            isActive
        } = req.body;

        // Required fields
        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Name, email and password are required"
            });
        }

        // Check existing email
        const existingUser = await UserSchema.findOne({
            email: email.toLowerCase().trim()
        });

        if (existingUser) {
            return res.status(400).json({
                message: "A user with this email already exists"
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(
            password,
            10
        );

        // Create user object
        const customerData = {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            role: "user",
            country: country || "India",
            preferredcurrency:
                preferredcurrency || "INR",

            // Admin-created customers are considered
            // email verified.
            isEmailVerified: true,

            isActive:
                isActive === undefined
                    ? true
                    : isActive === "true"
        };

        // Upload profile image if provided
        if (req.file) {

            const uploadedImage =
                await new Promise((resolve, reject) => {

                    const stream =
                        cloudinary.uploader.upload_stream(
                            {
                                folder: "ostik/profile",
                                resource_type: "image"
                            },
                            (error, result) => {

                                if (error) {
                                    reject(error);
                                } else {
                                    resolve(result);
                                }

                            }
                        );

                    stream.end(req.file.buffer);
                });

            customerData.profileImage =
                uploadedImage.secure_url;
        }

        const customer =
            await UserSchema.create(
                customerData
            );

        const safeCustomer =
            customer.toObject();

        delete safeCustomer.password;

        res.status(201).json({
            message:
                "Customer created successfully",
            customer: safeCustomer
        });

    } catch (error) {

        console.log(
            "Create customer error:",
            error
        );

        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};


// =========================================================
// ADMIN - UPDATE CUSTOMER
// =========================================================

const UpdateCustomer = async (req, res) => {
    try {

        const { id } = req.params;

        const {
            name,
            email,
            password,
            country,
            preferredcurrency,
            isActive
        } = req.body;

        const customer =
            await UserSchema.findOne({
                _id: id,
                role: "user"
            });

        if (!customer) {
            return res.status(404).json({
                message: "Customer not found"
            });
        }

        // ---------------------------------------------
        // UPDATE BASIC FIELDS
        // ---------------------------------------------

        if (name !== undefined) {
            customer.name = name.trim();
        }

        // ---------------------------------------------
        // UPDATE EMAIL
        // ---------------------------------------------

        if (email !== undefined) {

            const normalizedEmail =
                email.toLowerCase().trim();

            const existingUser =
                await UserSchema.findOne({
                    email: normalizedEmail,
                    _id: { $ne: id }
                });

            if (existingUser) {
                return res.status(400).json({
                    message:
                        "Another user already uses this email"
                });
            }

            customer.email = normalizedEmail;
        }

        // ---------------------------------------------
        // UPDATE PASSWORD
        // ---------------------------------------------

        if (
            password !== undefined &&
            password.trim() !== ""
        ) {

            customer.password =
                await bcrypt.hash(
                    password,
                    10
                );
        }

        // ---------------------------------------------
        // UPDATE COUNTRY
        // ---------------------------------------------

        if (country !== undefined) {
            customer.country = country;
        }

        // ---------------------------------------------
        // UPDATE CURRENCY
        // ---------------------------------------------

        if (
            preferredcurrency !== undefined
        ) {
            customer.preferredcurrency =
                preferredcurrency;
        }

        // ---------------------------------------------
        // UPDATE ACTIVE STATUS
        // ---------------------------------------------

        if (isActive !== undefined) {
            customer.isActive =
                isActive === "true" ||
                isActive === true;
        }

        // ---------------------------------------------
        // UPDATE PROFILE IMAGE
        // ---------------------------------------------

        if (req.file) {

            const uploadedImage =
                await new Promise(
                    (resolve, reject) => {

                        const stream =
                            cloudinary.uploader.upload_stream(
                                {
                                    folder:
                                        "ostik/profile",
                                    resource_type:
                                        "image"
                                },
                                (
                                    error,
                                    result
                                ) => {

                                    if (error) {
                                        reject(error);
                                    } else {
                                        resolve(result);
                                    }

                                }
                            );

                        stream.end(
                            req.file.buffer
                        );
                    }
                );

            customer.profileImage =
                uploadedImage.secure_url;
        }

        await customer.save();

        const safeCustomer =
            customer.toObject();

        delete safeCustomer.password;

        res.status(200).json({
            message:
                "Customer updated successfully",
            customer: safeCustomer
        });

    } catch (error) {

        console.log(
            "Update customer error:",
            error
        );

        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};


// =========================================================
// ADMIN - TOGGLE CUSTOMER STATUS
// =========================================================

const ToggleCustomerStatus = async (
    req,
    res
) => {
    try {

        const { id } = req.params;

        const customer =
            await UserSchema.findOne({
                _id: id,
                role: "user"
            });

        if (!customer) {
            return res.status(404).json({
                message: "Customer not found"
            });
        }

        customer.isActive =
            !customer.isActive;

        await customer.save();

        res.status(200).json({
            message: customer.isActive
                ? "Customer activated successfully"
                : "Customer deactivated successfully",
            isActive: customer.isActive
        });

    } catch (error) {

        console.log(
            "Toggle customer status error:",
            error
        );

        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
};


module.exports = {RegiterUser, VerifyOTP, LoginUser,ForgotPassword, verifyForgotPasswordOTP, ResetPassword,
    ProtectedTest, GetProfile, UpdateProfile, AddAddress, UpdateAddress, DeleteAddress, ResendOTP,
    GetCustomers, GetCustomer, CreateCustomer, UpdateCustomer, ToggleCustomerStatus
}