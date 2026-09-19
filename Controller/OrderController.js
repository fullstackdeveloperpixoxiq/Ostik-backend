const OrderSchema = require("../models/OrderSchema");
const CartSchema = require("../models/CartSchema");
const UserSchema = require("../models/UserSchema");
const ProductSchema = require("../models/ProductSchema"); 
const VariantSchema = require("../models/VariantSchema"); 


// CREATE ORDER
// const CreateOrder = async (req, res) => {
//     try {

//         const userId = req.user.userId;

//         const {
//             shippingAddress,
//             paymentMethod
//         } = req.body;

//         // Check required fields
//         if (!shippingAddress || !paymentMethod) {
//             return res.status(400).json({
//                 message: "Shipping address and payment method are required"
//             });
//         }

//         // Check payment method
//         if (!["cod", "razorpay"].includes(paymentMethod)) {
//             return res.status(400).json({
//                 message: "Invalid payment method"
//             });
//         }

//         // Find cart
//         const cart = await CartSchema.findOne({
//             user: userId
//         });

//         if (!cart || cart.items.length === 0) {
//             return res.status(400).json({
//                 message: "Cart is empty"
//             });
//         }

//         // Create product snapshots
//         const orderItems = [];

//         let subtotal = 0;

//         for (const cartItem of cart.items) {

//             const product = await ProductSchema.findById(
//                 cartItem.product
//             );

//             if (!product) {
//                 return res.status(404).json({
//                     message: "Product not found"
//                 });
//             }

//             // Check stock
//             if (product.stock < cartItem.quantity) {
//                 return res.status(400).json({
//                     message: `${product.name} is out of stock`
//                 });
//             }

//             const price = product.basePrice;

//             const itemTotal = price * cartItem.quantity;

//             subtotal += itemTotal;

//             orderItems.push({
//                 product: product._id,
//                 name: product.name,
//                 price: price,
//                 quantity: cartItem.quantity,
//                 image: product.images?.[0] || ""
//             });
//         }

//         // Shipping fee
//         const shippingFee = 0;

//         // Discount
//         const discount = 0;

//         // Total
//         const total = subtotal - discount + shippingFee;

//         // Create order
//         const order = await OrderSchema.create({
//             user: userId,

//             shippingAddress,

//             items: orderItems,

//             paymentMethod,

//             paymentStatus: "Pending",

//             subtotal,

//             discount,

//             shippingFee,

//             total,

//             currency: "INR",

//             exchangeRateUsed: 1,

//             orderStatus: "Pending",

//             placedAt: new Date()
//         });

//         // Reduce product stock
//         for (const cartItem of cart.items) {

//             await ProductSchema.findByIdAndUpdate(
//                 cartItem.product,
//                 {
//                     $inc: {
//                         stock: -cartItem.quantity
//                     }
//                 }
//             );
//         }

//         // Clear cart
//         cart.items = [];

//         await cart.save();

//         res.status(201).json({
//             message: "Order created successfully",
//             order
//         });

//     } catch (err) {

//         console.log(err);

//         res.status(500).json({
//             message: "Server error",
//             error: err.message
//         });
//     }
// };

const CreateOrder = async (req, res) => {
  try {

    const userId = req.user.userId;

    const {
      shippingAddress,
      paymentMethod
    } = req.body;


    // -------------------------
    // VALIDATION
    // -------------------------

    if (!shippingAddress || !paymentMethod) {
      return res.status(400).json({
        message: "Shipping address and payment method are required"
      });
    }

    if (!["cod", "razorpay"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "Invalid payment method"
      });
    }


    // -------------------------
    // FIND CART
    // -------------------------

    const cart = await CartSchema.findOne({
      user: userId
    });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        message: "Cart is empty"
      });
    }


    // -------------------------
    // CREATE ORDER ITEMS
    // -------------------------

    const orderItems = [];

    let subtotal = 0;
    let totalDiscount = 0;


    for (const cartItem of cart.items) {

      // Find product
      const product = await ProductSchema.findById(
        cartItem.product
      );

      if (!product) {
        return res.status(404).json({
          message: "Product not found"
        });
      }


      // Find variant
      const variant = await VariantSchema.findById(
        cartItem.variant
      );

      if (!variant) {
        return res.status(404).json({
          message: `Variant not found for ${product.name}`
        });
      }


      // Check variant belongs to product
      if (
        variant.product.toString() !==
        product._id.toString()
      ) {
        return res.status(400).json({
          message: "Invalid variant for product"
        });
      }


      // Check variant active
      if (!variant.isActive) {
        return res.status(400).json({
          message: `${product.name} variant is inactive`
        });
      }


      // Check stock
      if (variant.stock < cartItem.quantity) {
        return res.status(400).json({
          message: `${product.name} has only ${variant.stock} items available`
        });
      }


      // -------------------------
      // PRICE CALCULATION
      // -------------------------

      const price = Math.round(variant.price);

      const discountPercent =
      Number(variant.discountPercent) || 0;

      const discountAmount =
        Math.round((price * discountPercent) / 100)

      const finalPrice =
        price - discountAmount;


      // Item subtotal
      const itemTotal =
        finalPrice * cartItem.quantity;


      subtotal += itemTotal;

      totalDiscount +=
        discountAmount * cartItem.quantity;


      // -------------------------
      // ORDER ITEM SNAPSHOT
      // -------------------------

      orderItems.push({

        productId: product._id,

        variantId: variant._id,

        name: product.name,

        variantName: variant.name,

        sku: variant.sku,

        image:
          variant.images?.[0] ||
          product.images?.[0] ||
          "",

        price: price,

        discountPercent: discountPercent,

        finalPrice: finalPrice,

        quantity: cartItem.quantity,

        snapshot: {
          productName: product.name,
          variantName: variant.name,
          sku: variant.sku,
          price: price,
          discountPercent: discountPercent,
          finalPrice: finalPrice
        }
      });
    }


    // -------------------------
    // SHIPPING
    // -------------------------

    const shippingFee = 0;


    // -------------------------
    // DISCOUNT
    // -------------------------

    const discount = totalDiscount;


    // -------------------------
    // TOTAL
    // -------------------------

    const total =
      subtotal + shippingFee;


    // -------------------------
    // CREATE ORDER
    // -------------------------

    const order = await OrderSchema.create({

      user: userId,

      shippingAddress,

      items: orderItems,

      paymentMethod,

      paymentStatus: "Pending",

      subtotal,

      discount,

      shippingFee,

      total,

      currency: "INR",

      exchangeRateUsed: 1,

      orderStatus: "Pending",

      placedAt: new Date()
    });

    // ================================================= 
    // COD ONLY // Reduce stock and clear cart immediately
    // ================================================= 
    if (paymentMethod === "cod") { 
      for (const cartItem of cart.items) { 
        await VariantSchema.findByIdAndUpdate( 
          cartItem.variant, 
          { $inc: 
            { stock: -cartItem.quantity, 
            }, 
          } 
        ); 
        }


        // Clear cart 
      cart.items = []; 
      await cart.save(); 
    }


    // ================================================= 
    // RAZORPAY 
    // ================================================= 
    // For Razorpay: 
    // DO NOT reduce stock here. 
    // DO NOT clear cart here. 
    // These will happen only after 
    // successful payment verification. 
    // ================================================= 

    return res.status(201).json({ 
      message: "Order created successfully", order, 
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({

      message: "Server error",

      error: err.message

    });

  }
};



// GET MY ORDERS
const GetMyOrders = async (req, res) => {
    try {

        const userId = req.user.userId;

        const orders = await OrderSchema.find({
            user: userId
        })
        .sort({ createdAt: -1 });

        res.status(200).json({
            message: "Orders fetched successfully",
            orders
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};

// GET UNIQUE ADDRESSES FROM THE USER'S PREVIOUS ORDERS
const GetSavedAddresses = async (req, res) => {
    try {
        const userId = req.user.userId;

        const orders = await OrderSchema.find({ user: userId })
            .sort({ createdAt: -1 })
            .select("shippingAddress");

        const addresses = [];
        const seen = new Set();

        for (const order of orders) {
            const address = order.shippingAddress;

            if (!address) continue;

            const key = [
                address.fullName,
                address.phone,
                address.address,
                address.city,
                address.state,
                address.pincode,
            ]
                .map((value) => String(value || "").trim().toLowerCase())
                .join("|");

            if (!seen.has(key)) {
                seen.add(key);
                addresses.push(address);
            }
        }

        res.status(200).json({
            message: "Saved addresses fetched successfully",
            addresses,
        });
    } catch (err) {
        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message,
        });
    }
};



// GET SINGLE ORDER
const GetSingleOrder = async (req, res) => {
    try {

        const userId = req.user.userId;

        const { id } = req.params;

        const order = await OrderSchema.findOne({
            _id: id,
            user: userId
        });

        if (!order) {
            return res.status(404).json({
                message: "Order not found"
            });
        }

        res.status(200).json({
            message: "Order fetched successfully",
            order
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};



// CANCEL ORDER
const CancelOrder = async (req, res) => {
    try {

        const userId = req.user.userId;

        const { id } = req.params;

        const order = await OrderSchema.findOne({
            _id: id,
            user: userId
        });

        if (!order) {
            return res.status(404).json({
                message: "Order not found"
            });
        }

        // Don't allow cancellation after shipping
        if (
            order.orderStatus === "Shipped" ||
            order.orderStatus === "Delivered" ||
            order.orderStatus === "Cancelled"
        ) {
            return res.status(400).json({
                message: "Order cannot be cancelled"
            });
        }

        order.orderStatus = "Cancelled";

        await order.save();

        res.status(200).json({
            message: "Order cancelled successfully",
            order
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


// ADMIN - UPDATE ORDER
const UpdateOrder = async (req, res) => {
    try {

        const { id } = req.params;

        const {
            orderStatus,
            paymentStatus,
            trackingNumber,
            carrier,
            estimatedDelivery
        } = req.body;

        // Find order
        const order = await OrderSchema.findById(id);

        if (!order) {
            return res.status(404).json({
                message: "Order not found"
            });
        }

        // Update order status
        if (orderStatus !== undefined) {
            order.orderStatus = orderStatus;
        }

        // Update payment status
        if (paymentStatus !== undefined) {
            order.paymentStatus = paymentStatus;
        }

        // Update tracking number
        if (trackingNumber !== undefined) {
            order.trackingNumber = trackingNumber;
        }

        // Update carrier
        if (carrier !== undefined) {
            order.carrier = carrier;
        }

        // Update estimated delivery
        if (estimatedDelivery !== undefined) {
            order.estimatedDelivery = estimatedDelivery;
        }

        await order.save();

        res.status(200).json({
            message: "Order updated successfully",
            order
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


module.exports = { CreateOrder, GetMyOrders, GetSavedAddresses, GetSingleOrder, CancelOrder, UpdateOrder };
