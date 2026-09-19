const bcrypt= require("bcryptjs");
const UserSchema = require("../models/UserSchema");
const OtpSchema = require("../models/OtpSchema");
const nodeMailer= require("nodemailer");
const Jwt= require("jsonwebtoken");
const mongoose= require("mongoose");
const cloudinary= require("../Config/Cloudinary")
require("dotenv").config()

const RegiterUser= async(req,res)=>{ 
    try{ 
    const {name,email,password}= req.body; 

    //check all fields are required 
    if(!name || !email || !password){ 
        return res.status(400).json(
            { message: "All fields are required" }) 
        }; 

        //check existing user 
        const existingUser= await UserSchema.findOne({email}); 
        if(existingUser){ return res.status(200).json(
            { message: "User already exist" }) 
        }; 


        //hash password 
        const hashedPassword= await bcrypt.hash(password,10); 

        //user creation 
        const user= await UserSchema.create({ 
            name, 
            email, 
            password: hashedPassword 
        }); 
        

        //generate 6 digit OTP (100000-900000) 
        const otp= Math.floor(100000 + Math.random() * 900000).toString(); 

        //save the OTP 
        await OtpSchema.create({ 
            user: user._id, 
            email: user.email, 
            otp, 
            purpose: "emailVerification", 
            expiresAt: new Date(Date.now() + 10*60*1000) 
        }); 
        
        //email tranporter 
        const transporter= nodeMailer.createTransport({ 
            service: "gmail", 
            auth: { user: process.env.Email_User, pass: process.env.Email_Pass } 
        }); 

        //send otp 
        await transporter.sendMail({ 
            from: process.env.Email_User, 
            to: email, 
            subject: "Email Verification OTP", 
            text: `Your OTP is ${otp}, It will expires in 10 mins` 
        }); 
        
        //response 
        res.status(201).
        json({ message: "Registration successful. OTP sent to your email.", 
            userId: user._id, 
        }); 
    } 
    catch(error){ 
        console.log(error); 
        res.status(500).json({ message:"server error", 
            error: error.message 
        }) 
    } 
}


const VerifyOTP= async(req,res)=>{ 
    try{ 
        const {userId,otp}= req.body; 
        if(!userId || !otp){ 
            return res.status(400).json({ 
                message:"User ID and OTP are required" 
            }) 
        }; 
        
        //Find user 
        const user= await UserSchema.findById(userId) 
        if (!user) { 
            return res.status(404).json({ 
                message: "User not found" 
            }); 
        }; 
        
        //OTP verification 
        const otpRecord= await OtpSchema.findOne({ 
            user: userId, 
            otp: otp, 
            purpose: "emailVerification", 
            isUsed: false 
        }); 
        
        if (!otpRecord) { 
            return res.status(400).json({ 
                message: "Invalid or already used OTP" 
            }); 
        } 
        
        //check OTP expiration 
        if(otpRecord.expiresAt < new Date()){ 
            return res.status(400).json({ 
                message: "OTP has expired" 
            }); 
        } 
        
        //verify user's email 
        user.isEmailVerified = true; 
        await user.save() 
        
        //check OTP as used 
    otpRecord.isUsed= true 
    
    await otpRecord.save(); 
    res.status(200).json({ 
        message: "Email verified successfully" 
    }); 
} catch(error){ 
    console.log(error); 
    res.status(500).json({ 
        message: "Server error", error: error.message 
    }); 
} 
}


const ResendOTP = async (req, res) => {
    try {
        const { userId } = req.body;

        // Check userId
        if (!userId) {
            return res.status(400).json({
                message: "User ID is required"
            });
        }

        // Find user
        const user = await UserSchema.findById(userId);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        // Check email verification
        if (user.isEmailVerified) {
            return res.status(400).json({
                message: "Email is already verified"
            });
        }

        // Invalidate all previous unused OTPs
        await OtpSchema.updateMany(
            {
                user: userId,
                purpose: "emailVerification",
                isUsed: false
            },
            {
                isUsed: true
            }
        );

        // Generate new OTP
        const otp = Math.floor(
            100000 + Math.random() * 900000
        ).toString();

        console.log("New OTP generated:", otp);
        console.log("Sending OTP to:", user.email);

        // Save new OTP
        await OtpSchema.create({
            user: user._id,
            email: user.email,
            otp,
            purpose: "emailVerification",
            expiresAt: new Date(
                Date.now() + 1 * 60 * 1000
            )
        });

        // Create transporter
        const transporter = nodeMailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.Email_User,
                pass: process.env.Email_Pass
            }
        });

        // Send email
        const mailInfo = await transporter.sendMail({
            from: process.env.Email_User,
            to: user.email,
            subject: "Your OSTIK Email Verification OTP",
            text: `Your OSTIK verification OTP is ${otp}.

This OTP is valid for 1 minute.

For your security, do not share this OTP with anyone.

If you did not request this OTP, please ignore this email.`
        });

        console.log("OTP email sent successfully:", mailInfo.messageId);

        res.status(200).json({
            message: "A new OTP has been sent to your email."
        });

    } catch (error) {
        console.log("Resend OTP error:", error);

        res.status(500).json({
            message: "Server error",
            error: error.message
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



module.exports = {RegiterUser, VerifyOTP, LoginUser,ForgotPassword, verifyForgotPasswordOTP, ResetPassword,
    ProtectedTest, GetProfile, UpdateProfile, AddAddress, UpdateAddress, DeleteAddress, ResendOTP
}