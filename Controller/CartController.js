const CartSchema = require("../models/CartSchema");
const ProductSchema = require("../models/ProductSchema");
const VariantSchema = require("../models/VariantSchema");


// ADD TO CART
// const AddToCart = async (req, res) => {
//     try {

//         const userId = req.user.userId;

//         const { productId, quantity } = req.body;

//         // Check required fields
//         if (!productId || !quantity) {
//             return res.status(400).json({
//                 message: "Product ID and quantity are required"
//             });
//         }

//         // Check product
//         const product = await ProductSchema.findById(productId);

//         if (!product) {
//             return res.status(404).json({
//                 message: "Product not found"
//             });
//         }

//         // Find user's cart
//         let cart = await CartSchema.findOne({ user: userId });

//         // If cart doesn't exist, create one
//         if (!cart) {

//             cart = await CartSchema.create({
//                 user: userId,
//                 items: [
//                     {
//                         product: productId,
//                         quantity: quantity
//                     }
//                 ]
//             });

//             return res.status(201).json({
//                 message: "Product added to cart",
//                 cart
//             });
//         }

//         // Check whether product already exists
//         const existingItem = cart.items.find(
//             item => item.product.toString() === productId
//         );

//         if (existingItem) {

//             existingItem.quantity += quantity;

//         } else {

//             cart.items.push({
//                 product: productId,
//                 quantity: quantity
//             });

//         }

//         await cart.save();

//         res.status(200).json({
//             message: "Product added to cart",
//             cart
//         });

//     } catch (err) {

//         console.log(err);

//         res.status(500).json({
//             message: "Server error",
//             error: err.message
//         });
//     }
// };

const AddToCart = async (req, res) => {
  try {

    const userId = req.user.userId;

    const { productId, variantId, quantity } = req.body;

    if (!productId || !variantId || !quantity) {
      return res.status(400).json({
        message: "Product ID, variant ID and quantity are required"
      });
    }

    const product = await ProductSchema.findById(productId);

    if (!product) {
      return res.status(404).json({
        message: "Product not found"
      });
    }

    const variant = await VariantSchema.findById(variantId);

    if (!variant) {
      return res.status(404).json({
        message: "Variant not found"
      });
    }

    if (variant.product.toString() !== productId) {
      return res.status(400).json({
        message: "Variant does not belong to this product"
      });
    }

    if (!variant.isActive) {
      return res.status(400).json({
        message: "Variant is inactive"
      });
    }

    if (variant.stock < quantity) {
      return res.status(400).json({
        message: "Insufficient stock"
      });
    }

    let cart = await CartSchema.findOne({
      user: userId
    });

    if (!cart) {

      cart = await CartSchema.create({
        user: userId,
        items: [
          {
            product: productId,
            variant: variantId,
            quantity
          }
        ]
      });

      return res.status(201).json({
        message: "Product added to cart",
        cart
      });
    }

    const existingItem = cart.items.find(
      item =>
        item.product.toString() === productId &&
        item.variant.toString() === variantId
    );

    if (existingItem) {

      const newQuantity = existingItem.quantity + quantity;

      if (newQuantity > variant.stock) {
        return res.status(400).json({
          message: "Insufficient stock"
        });
      }

      existingItem.quantity = newQuantity;

    } else {

      cart.items.push({
        product: productId,
        variant: variantId,
        quantity
      });
    }

    await cart.save();

    res.status(200).json({
      message: "Product added to cart",
      cart
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
};



// GET CART
const GetCart = async (req, res) => {
    try {

        const userId = req.user.userId;

        const cart = await CartSchema.findOne({
            user: userId
        })
        .populate("items.product", "name slug description images")
        .populate(
          "items.variant",
          "name price sku discountPercent stock images isActive"
        );

        if (!cart) {
      return res.status(200).json({
        message: "Cart is empty",
        cart: {
          items: [],
        },
      });
    }

       return res.status(200).json({
            message: "Cart fetched successfully",
            cart
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};



// UPDATE CART ITEM QUANTITY
const UpdateCartItem = async (req, res) => {
    try {

        const userId = req.user.userId;

        const { variantId } = req.params;

        const { quantity } = req.body;

        if (!quantity || quantity < 1) {
            return res.status(400).json({
                message: "Quantity must be at least 1"
            });
        }

        const cart = await CartSchema.findOne({
            user: userId
        });

        if (!cart) {
            return res.status(404).json({
                message: "Cart not found"
            });
        }

        const item = cart.items.find(
            item => item.variant.toString() === variantId
        );

        if (!item) {
            return res.status(404).json({
                message: "Product not found in cart"
            });
        }

        // Check variant 
        const variant = await VariantSchema.findById(variantId);
        if (!variant) { 
          return res.status(404).json({ 
            message: "Variant not found", 
          }); 
        }

        if (!variant.isActive) { 
          return res.status(400).json({ 
            message: "Variant is inactive", 
          }); 
        } 


        // Check stock 
      if (quantity > variant.stock) { 
        return res.status(400).json({ 
          message: `Only ${variant.stock} items are available in stock`, 
        }); 
      }

      //update quantity
        item.quantity = quantity;

        await cart.save();

        // Fetch updated cart with populated product and variant data 
        const updatedCart = await CartSchema.findOne({ 
          user: userId, 
        }) 
        .populate( "items.product", "name slug description images" ) 
        .populate( "items.variant", "name price sku discountPercent stock images isActive" 

        );


        res.status(200).json({
            message: "Cart quantity updated successfully",
            cart:updatedCart
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};



// REMOVE ITEM FROM CART
const RemoveFromCart = async (req, res) => {
    try {

        const userId = req.user.userId;

        const { variantId } = req.params;

        const cart = await CartSchema.findOne({
            user: userId
        });

        if (!cart) {
            return res.status(404).json({
                message: "Cart not found"
            });
        }

        const itemIndex = cart.items.findIndex(
            item => item.variant.toString() === variantId
        );

        if (itemIndex === -1) {
            return res.status(404).json({
                message: "Product not found in cart"
            });
        }

        cart.items.splice(itemIndex, 1);

        await cart.save();

        res.status(200).json({
            message: "Product removed from cart",
            cart
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};



// CLEAR CART
const ClearCart = async (req, res) => {
    try {

        const userId = req.user.userId;

        const cart = await CartSchema.findOne({
            user: userId
        });

        if (!cart) {
            return res.status(404).json({
                message: "Cart not found"
            });
        }

        cart.items = [];

        await cart.save();

        res.status(200).json({
            message: "Cart cleared successfully"
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


module.exports = { AddToCart, GetCart, UpdateCartItem, RemoveFromCart, ClearCart };