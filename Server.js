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
const NewsletterRouter= require("./Routes/NewsletterRoutes")
const ReturnRouter= require("./Routes/ReturnRoutes")
const ExchangeRouter= require("./Routes/ExchangeRoutes")
const SettingsRouter= require("./Routes/SettingsRoutes")
const ChatbotRouter= require("./Routes/ChatbotRoutes")

const cors= require("cors")
const compression= require("compression")
require("dotenv").config()


// Opt-in: behind a reverse proxy set TRUST_PROXY=1 so req.ip (used by the
// chatbot rate limiter) is the real client IP. No effect when unset.
if (process.env.TRUST_PROXY) {
    const hops = Number(process.env.TRUST_PROXY)
    app.set("trust proxy", Number.isNaN(hops) ? process.env.TRUST_PROXY : hops)
}

//middleware
// gzip/brotli-negotiated compression for JSON responses (product lists are
// highly repetitive and shrink ~80%). Tiny responses are left as-is.
app.use(compression({ threshold: 1024 }))
app.use(express.json())

const allowedOrigins= [
    "http://localhost:5173",
    "http://localhost:5174",
    /^http:\/\/localhost:\d+$/,
    "https://ostik-frontend.vercel.app",
    "https://ostik.in",
    "https://www.ostik.in",
    "https://ostik-admin.vercel.app"

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
app.use("/api/newsletter", NewsletterRouter)
app.use("/api/return", ReturnRouter)
app.use("/api/exchange", ExchangeRouter)
app.use("/api/settings", SettingsRouter)
app.use("/api/chatbot", ChatbotRouter) // customer AI shopping assistant (read-only)


//admin side
app.use("/api/admin", adminRouter )



const Port= process.env.PORT || 5000;

//DB
ConnectDB()

app.listen(Port,()=>{
    console.log(`Server running on ${Port} `);
    
})