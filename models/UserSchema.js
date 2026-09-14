const mongoose= require("mongoose");


const userSchema= new mongoose.Schema({
    name:{
        type: String,
        required: true,
        trim: true
    },

    email:{
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },

    password:{
        type: String,
        required: true
    },

    role:{
        type: String,
        enum: ["user", "admin"],
        default: "user"
    },

    profileImage:{
        type: String,
        default:""
    },

    country:{
        type: String,
        default: "India"
    },

    preferredcurrency:{
        type: String,
        default: "INR"
    },

    addresses:{
        type: [mongoose.Schema.Types.Mixed],
        default:[]
    },

    isEmailVerified:{
        type: Boolean,
        default: false
    },

    isActive:{
        type: Boolean,
        default: true
    }
},
{
    timestamps: true
}
);


module.exports= mongoose.model("User",userSchema)

