const express= require("express");
const ConnectDB = require("./Config/Database");
const app= express()
const userRouter= require("./Routes/UserRoutes")
const categoryRouter= require("./Routes/CategoryRoutes")
const productRouter= require("./Routes/ProductRoutes")
const cartRouter= require("./Routes/CartRoutes")
const wishlistRouter= require("./Routes/WishlistRoutes")
const orderRouter= require("./Routes/OrderRoutes")
const paymentRouter= require("./Routes/PaymentRouter")
const reviewRouter= require("./Routes/ReviewRoutes")
const exchangeRateRouter= require("./Routes/ExchangerateRoutes")
const adminRouter= require("./Routes/AdminRoutes")
const variantRouter= require("./Routes/VarientRoutes")
const bannerRouter= require("./Routes/BannerRoutes")
const VideoSectionRouter= require("./Routes/VideoSectionRoute")
const ContactRouter= require("./Routes/ContactRoutes")

const cors= require("cors")
require("dotenv").config()


//middleware
app.use(express.json())

const allowedOrigins= [
    "http://localhost:5173",
    "https://ostik-frontend.vercel.app",
    "https://ostik.in",
    "https://www.ostik.in" //should add that custom domain

]

app.use(
    cors({
        origin: allowedOrigins,
        credentials: true
    })
)

app.get("/",(req,res)=>{
    res.send("Running")
})

//routes
app.use("/api/user", userRouter)
app.use("/api/category", categoryRouter )
app.use("/api/product", productRouter )
app.use("/api/cart", cartRouter )
app.use("/api/wishlist", wishlistRouter )
app.use("/api/order", orderRouter )
app.use("/api/payment", paymentRouter )
app.use("/api/review", reviewRouter )
app.use("/api/exchange-rate", exchangeRateRouter )
app.use("/api/variant", variantRouter )
app.use("/api/banner", bannerRouter )
app.use("/api/video-section", VideoSectionRouter )
app.use("/api/contact", ContactRouter)


//admin side
app.use("/api/admin", adminRouter )



const Port= process.env.PORT || 5000;

//DB
ConnectDB()

app.listen(Port,()=>{
    console.log(`Server running on ${Port} `);
    
})