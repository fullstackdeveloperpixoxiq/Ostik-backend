const mongoose= require("mongoose");
require("dotenv").config()


const ConnectDB= async ()=>{
    try{
        const URI= process.env.MONGO_URL

        await mongoose.connect(URI);
            console.log("Mongodb connected");
            
    }
    catch(err){
        console.log("Database connection failed.");
        console.error(err);
        
        process.exit(1)      
    }
}

module.exports= ConnectDB