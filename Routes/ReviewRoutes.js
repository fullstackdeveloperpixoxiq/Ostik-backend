const express = require("express");

const {CreateReview,GetProductReviews,GetMyReviews,UpdateReview,DeleteReview,GetAllReviews,
    UpdateReviewApproval,AdminDeleteReview} = require("../Controller/ReviewController");


const authMiddleware = require("../Middleware/AuthMiddleware");
const AdminMiddleware = require("../Middleware/AdminMiddleware");
const upload= require("../Middleware/Upload")
const router = express.Router();

//user
router.post("/",authMiddleware,upload.array("images",3),CreateReview);
router.get("/product/:productId",GetProductReviews);
router.get("/my-reviews",authMiddleware,GetMyReviews);
router.put("/:id",authMiddleware,UpdateReview); // review ID
router.delete("/:id",authMiddleware,DeleteReview);

//admin
router.get("/admin/all",authMiddleware,AdminMiddleware,GetAllReviews);
router.put("/admin/:id",authMiddleware,AdminMiddleware,UpdateReviewApproval);
router.delete("/admin/:id",authMiddleware,AdminMiddleware,AdminDeleteReview);




module.exports = router;