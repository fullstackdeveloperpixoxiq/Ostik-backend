const ReviewSchema = require("../models/ReviewSchema");
const OrderSchema = require("../models/OrderSchema");
const ProductSchema = require("../models/ProductSchema");


// ======================================================
// USER SIDE
// ======================================================


// CREATE REVIEW
const CreateReview = async (req, res) => {
    try {

        const userId = req.user.userId;

        const {
            product,
            order,
            rating,
            comment
        } = req.body;

        // Required fields
        if (!product || !order || !rating) {
            return res.status(400).json({
                message: "Product, order and rating are required"
            });
        }

        // Check product
        const existingProduct = await ProductSchema.findById(product);

        if (!existingProduct) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        // Check order belongs to user
        const existingOrder = await OrderSchema.findOne({
            _id: order,
            user: userId
        });

        if (!existingOrder) {
            return res.status(404).json({
                message: "Order not found"
            });
        }

        // User can review only delivered order
        if (existingOrder.orderStatus !== "Delivered") {
            return res.status(400).json({
                message: "You can review a product only after delivery"
            });
        }

        // Check product exists in this order
        const orderItem = existingOrder.items.find(
            item => String(item.productId) === String(product)
        );

        if (!orderItem) {
            return res.status(400).json({
                message: "You cannot review this product"
            });
        }

        // Check whether user already reviewed this product/order
        const existingReview = await ReviewSchema.findOne({
            user: userId,
            product: product,
            order: order
        });

        if (existingReview) {
            return res.status(400).json({
                message: "You have already reviewed this product"
            });
        }

        // Create review
        const review = await ReviewSchema.create({
            product,
            user: userId,
            order,
            rating,
            comment: comment || "",
            isVerifiedPurchase: true,
            isApproved: true
        });

        res.status(201).json({
            message: "Review created successfully",
            review
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


// GET REVIEWS OF A PRODUCT
const GetProductReviews = async (req, res) => {
    try {

        const { productId } = req.params;

        const reviews = await ReviewSchema.find({
            product: productId,
            isApproved: true
        })
        .populate("user", "name profileImage")
        .sort({ createdAt: -1 });

        res.status(200).json({
            message: "Reviews fetched successfully",
            reviews
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


// GET MY REVIEWS
const GetMyReviews = async (req, res) => {
    try {

        const userId = req.user.userId;

        const reviews = await ReviewSchema.find({
            user: userId
        })
        .populate("product", "name images")
        .sort({ createdAt: -1 });

        res.status(200).json({
            message: "Your reviews fetched successfully",
            reviews
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


// UPDATE MY REVIEW
const UpdateReview = async (req, res) => {
    try {

        const userId = req.user.userId;

        const { id } = req.params;

        const {rating,comment} = req.body;

        const review = await ReviewSchema.findOne({
            _id: id,
            user: userId
        });

        if (!review) {
            return res.status(404).json({
                message: "Review not found"
            });
        }

        // Update only provided fields
        if (rating !== undefined) {
            review.rating = rating;
        }

        if (comment !== undefined) {
            review.comment = comment;
        }

        await review.save();

        res.status(200).json({
            message: "Review updated successfully",
            review
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


// DELETE MY REVIEW
const DeleteReview = async (req, res) => {
    try {

        const userId = req.user.userId;

        const { id } = req.params;

        const review = await ReviewSchema.findOne({
            _id: id,
            user: userId
        });

        if (!review) {
            return res.status(404).json({
                message: "Review not found"
            });
        }

        await review.deleteOne();

        res.status(200).json({
            message: "Review deleted successfully"
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};



// ======================================================
// ADMIN SIDE
// ======================================================


// ADMIN - GET ALL REVIEWS
const GetAllReviews = async (req, res) => {
    try {

        const reviews = await ReviewSchema.find()
            .populate("user", "name email")
            .populate("product", "name")
            .populate("order")
            .sort({ createdAt: -1 });

        res.status(200).json({
            message: "All reviews fetched successfully",
            reviews
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


// ADMIN - UPDATE REVIEW APPROVAL
const UpdateReviewApproval = async (req, res) => {
    try {

        const { id } = req.params;

        const { isApproved } = req.body;

        const review = await ReviewSchema.findById(id);

        if (!review) {
            return res.status(404).json({
                message: "Review not found"
            });
        }

        if (isApproved !== undefined) {
            review.isApproved = isApproved;
        }

        await review.save();

        res.status(200).json({
            message: "Review approval updated successfully",
            review
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


// ADMIN - DELETE REVIEW
const AdminDeleteReview = async (req, res) => {
    try {

        const { id } = req.params;

        const review = await ReviewSchema.findById(id);

        if (!review) {
            return res.status(404).json({
                message: "Review not found"
            });
        }

        await review.deleteOne();

        res.status(200).json({
            message: "Review deleted successfully"
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


module.exports = {CreateReview,GetProductReviews,GetMyReviews,UpdateReview,DeleteReview,
    GetAllReviews,UpdateReviewApproval,AdminDeleteReview};