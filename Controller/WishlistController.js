const WishlistSchema = require("../models/WishlistSchema");
const ProductSchema = require("../models/ProductSchema");
const VariantSchema= require("../models/VariantSchema")

// ADD PRODUCT TO WISHLIST
const AddToWishlist = async (req, res) => {
    try {

        const userId = req.user.userId;
        const { productId } = req.body;

        // Check product ID
        if (!productId) {
            return res.status(400).json({
                message: "Product ID is required"
            });
        }

        // Check product exists
        const product = await ProductSchema.findById(productId);

        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        // Find user's wishlist
        let wishlist = await WishlistSchema.findOne({
            user: userId
        });

        // Create wishlist if it doesn't exist
        if (!wishlist) {

            wishlist = await WishlistSchema.create({
                user: userId,
                products: [productId]
            });

            return res.status(201).json({
                message: "Product added to wishlist",
                wishlist
            });
        }

        // Check whether product already exists 
        const alreadyExists = wishlist.products.some( product => 
            product.toString() === productId ); 
            
            if (alreadyExists) { 
                return res.status(400).json({ 
                    message: "Product already in wishlist" 
                }); }

        // Add product
        wishlist.products.push(productId);

        await wishlist.save();

        res.status(200).json({
            message: "Product added to wishlist",
            wishlist
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};



// GET WISHLIST
const GetWishlist = async (req, res) => {
    try {

        const userId = req.user.userId;

        const wishlist = await WishlistSchema.findOne({
            user: userId
        }).populate("products", "name slug description images");

        if (!wishlist) {
            return res.status(200).json({
                message: "Wishlist is empty",
                wishlist: {
                    products: []
                }
            });
        }

        const products = await Promise.all(
            wishlist.products.map(async (product) => {

                const variant = await VariantSchema.findOne({
                    product: product._id,
                    isActive: true
                });

                return {
                    ...product.toObject(),
                    variant
                };
            })
        );

        res.status(200).json({
            message: "Wishlist fetched successfully",
            wishlist: {
                ...wishlist.toObject(),
                products
            }
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


// REMOVE PRODUCT FROM WISHLIST
const RemoveFromWishlist = async (req, res) => {
    try {

        const userId = req.user.userId;
        const { productId } = req.params;

        const wishlist = await WishlistSchema.findOne({
            user: userId
        });

        if (!wishlist) {
            return res.status(404).json({
                message: "Wishlist not found"
            });
        }

        // Find product index
        const productIndex = wishlist.products.findIndex(
            product => product.toString() === productId
        );

        if (productIndex === -1) {
            return res.status(404).json({
                message: "Product not found in wishlist"
            });
        }

        // Remove product
        wishlist.products.splice(productIndex, 1);

        await wishlist.save();

        res.status(200).json({
            message: "Product removed from wishlist",
            wishlist
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};



// CLEAR WISHLIST
const ClearWishlist = async (req, res) => {
    try {

        const userId = req.user.userId;

        const wishlist = await WishlistSchema.findOne(
            {user: userId}
        );

        if (!wishlist) {
            return res.status(404).json({
                message: "Wishlist not found"
            });
        }

        wishlist.products = []; 

        await wishlist.save();

        
        res.status(200).json({
            message: "Wishlist cleared successfully"
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


module.exports = { AddToWishlist, GetWishlist, RemoveFromWishlist, ClearWishlist };