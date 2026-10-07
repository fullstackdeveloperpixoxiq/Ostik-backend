const OrderSchema = require("../models/OrderSchema");
const CartSchema = require("../models/CartSchema");
const UserSchema = require("../models/UserSchema");
const ProductSchema = require("../models/ProductSchema");
const VariantSchema = require("../models/VariantSchema");


// =====================================================
// CREATE ORDER
// =====================================================

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
        Math.round(
          (price * discountPercent) / 100
        );

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
          product.images?.[0] || "",

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

    const shippingFee = subtotal >= 999 ? 0 : 70;

    // -------------------------
    // DISCOUNT
    // -------------------------

    const discount = totalDiscount;

    // -------------------------
    // TOTAL
    // -------------------------

    const total =
      subtotal + shippingFee;

      //estimate calculation
      const estimatedDeliveryFrom= new Date();
      estimatedDeliveryFrom.setDate(
        estimatedDeliveryFrom.getDate() + 4
      );

      const estimatedDeliveryTo= new Date();
      estimatedDeliveryTo.setDate(
        estimatedDeliveryTo.getDate() + 8
      )

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
      shipping:{
        carrier: "India Post",
  trackingNumber: "",
  shippedAt: null,
  estimatedDeliveryFrom,
  estimatedDeliveryTo,
  trackingHistory: [
    {
      status: "Pending",
      updatedAt: new Date(),
      updatedBy: "system",
    },
  ],
      },
      total,
      currency: "INR",
      exchangeRateUsed: 1,
      orderStatus: "Pending",


      placedAt: new Date()
    });

    // =================================================
    // COD ONLY
    // Reduce stock and clear cart immediately
    // =================================================

    if (paymentMethod === "cod") {

      for (const cartItem of cart.items) {

        await VariantSchema.findByIdAndUpdate(
          cartItem.variant,
          {
            $inc: {
              stock: -cartItem.quantity
            }
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
    // These happen after successful payment verification.
    // =================================================

    return res.status(201).json({
      message: "Order created successfully",
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


// =====================================================
// GET MY ORDERS
// =====================================================

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


// =====================================================
// GET UNIQUE ADDRESSES
// =====================================================

const GetSavedAddresses = async (req, res) => {
  try {

    const userId = req.user.userId;

    const orders = await OrderSchema.find({
      user: userId
    })
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
        .map((value) =>
          String(value || "")
            .trim()
            .toLowerCase()
        )
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


// =====================================================
// GET SINGLE ORDER
// =====================================================

const GetSingleOrder = async (req, res) => {
  try {

    const userId = req.user.userId;

    const { id } = req.params;

    const order = await OrderSchema.findOne({
      _id: id,
      user: userId
    })
      .populate("items.productId", "images");

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


// =====================================================
// CANCEL ORDER - USER
// =====================================================

const CancelOrder = async (req, res) => {
  try {

    const userId = req.user.userId;

    const { id } = req.params;

    const { reason, comment } = req.body;

    // -------------------------
    // VALIDATION
    // -------------------------

    if (!reason) {
      return res.status(400).json({
        message: "Cancellation reason is required",
      });
    }

    // -------------------------
    // FIND ORDER
    // -------------------------

    const order = await OrderSchema.findOne({
      _id: id,
      user: userId,
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    // -------------------------
    // CHECK CANCELLATION STATUS
    // -------------------------

    if (
      order.orderStatus === "Shipped" ||
      order.orderStatus === "Delivered" ||
      order.orderStatus === "Cancelled"
    ) {
      return res.status(400).json({
        message: "Order cannot be cancelled",
      });
    }

    // -------------------------
    // CANCEL ORDER
    // -------------------------

    order.orderStatus = "Cancelled";

    order.cancellation = {
      reason,
      comment: comment || "",
      cancelledAt: new Date(),
      cancelledBy: "user",
    };

    // Add tracking history
    order.shipping.trackingHistory.push({
      status: "Cancelled",
      updatedAt: new Date(),
      updatedBy: "user"
    });

    await order.save();

    res.status(200).json({
      message: "Order cancelled successfully",
      order,
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


// =====================================================
// GET ALL ORDERS - ADMIN
// =====================================================

const GetAllOrders = async (req, res) => {
  try {

    const orders = await OrderSchema.find({})
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: "All orders fetched successfully",
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


// =====================================================
// UPDATE ORDER - ADMIN
// =====================================================

const UpdateOrder = async (req, res) => {
  try {

    const { id } = req.params;

    const {
      orderStatus,
      paymentStatus,
      trackingNumber,
      carrier,
      estimatedDelivery,
    } = req.body;

    // =====================================================
    // FIND ORDER
    // =====================================================

    const order = await OrderSchema.findById(id);

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    // =====================================================
    // ADMIN MANAGEABLE ORDER STATUSES
    // =====================================================

    // Processing is included ONLY for old existing orders.
    // New orders should use:
    // Pending → Packed → Shipped → Delivered

    const validOrderStatuses = [
      "Pending",
      "Processing",
      "Packed",
      "Shipped",
      "Delivered",
    ];

    // =====================================================
    // PAYMENT STATUSES
    // =====================================================

    const validPaymentStatuses = [
      "Pending",
      "Paid",
      "Failed",
      "Refunded",
    ];

    // =====================================================
    // UPDATE ORDER STATUS
    // =====================================================

    if (orderStatus !== undefined) {

      // Cancelled orders are permanently locked
      if (order.orderStatus === "Cancelled") {
        return res.status(400).json({
          message:
            "This order is already Cancelled and cannot be changed.",
        });
      }

      // Return status is also locked
      if (order.orderStatus === "Returned") {
        return res.status(400).json({
          message:
            "This order has already been Returned and cannot be changed.",
        });
      }

      // Validate status
      if (!validOrderStatuses.includes(orderStatus)) {
        return res.status(400).json({
          message:
            `Invalid order status: ${orderStatus}`,
        });
      }

      const previousStatus =
        order.orderStatus;

      order.orderStatus =
        orderStatus;

      // ===================================================
      // DELIVERY DATE
      // ===================================================

      if (
  orderStatus === "Delivered" &&
  !order.deliveredAt
) {
  order.deliveredAt = new Date();
}

      // ===================================================
      // TRACKING HISTORY
      // ===================================================

      if (
        previousStatus !==
        orderStatus
      ) {

        order.shipping.trackingHistory.push({
          status: orderStatus,
          updatedAt: new Date(),
          updatedBy: "admin"
        });
      }
    }

    // =====================================================
    // UPDATE PAYMENT STATUS
    // =====================================================

    if (paymentStatus !== undefined) {

      if (
        !validPaymentStatuses.includes(
          paymentStatus
        )
      ) {

        return res.status(400).json({
          message:
            `Invalid payment status: ${paymentStatus}`,
        });
      }

      order.paymentStatus =
        paymentStatus;
    }

    // =====================================================
    // TRACKING NUMBER
    // =====================================================

    if (trackingNumber !== undefined) {

      order.trackingNumber =
        trackingNumber;
    }

    // =====================================================
    // CARRIER
    // =====================================================

    if (carrier !== undefined) {

      order.carrier =
        carrier;
    }

    // =====================================================
    // ESTIMATED DELIVERY
    // =====================================================

    if (
      estimatedDelivery !== undefined
    ) {

      order.estimatedDelivery =
        estimatedDelivery || null;
    }

    // =====================================================
    // SAVE
    // =====================================================

    await order.save();

    return res.status(200).json({
      message:
        "Order updated successfully",
      order,
    });

  } catch (err) {

    console.log(err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


// =====================================================
// GET SINGLE ORDER - ADMIN
// =====================================================

const GetAdminSingleOrder = async (
  req,
  res
) => {

  try {

    const { id } =
      req.params;

    const order =
      await OrderSchema.findById(id)
        .populate(
          "user",
          "name email"
        );

    if (!order) {

      return res.status(404).json({
        message:
          "Order not found",
      });
    }

    res.status(200).json({
      message:
        "Order fetched successfully",
      order,
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      message:
        "Server error",
      error:
        err.message,
    });
  }
};


// =====================================================
// CANCEL ORDER - ADMIN
// =====================================================

const AdminCancelOrder = async (req,res) => {

  try {
    const { id } = req.params;

    const {
      reason,
      comment } = req.body;

    // -------------------------
    // VALIDATION
    // -------------------------

    if (!reason || !reason.trim()) {

      return res.status(400).json({
        message:
          "Cancellation reason is required",
      });
    }

    // -------------------------
    // FIND ORDER
    // -------------------------

    const order =
      await OrderSchema.findById(id);

    if (!order) {

      return res.status(404).json({
        message:
          "Order not found",
      });
    }

    // -------------------------
    // CHECK STATUS
    // -------------------------

    if (
      order.orderStatus ===
        "Shipped" ||
      order.orderStatus ===
        "Delivered" ||
      order.orderStatus ===
        "Cancelled"
    ) {

      return res.status(400).json({
        message:
          "Order cannot be cancelled",
      });
    }

    // -------------------------
    // CANCEL ORDER
    // -------------------------

    order.orderStatus =
      "Cancelled";

    order.cancellation = {
      reason: reason.trim(),
      comment: comment?.trim() || "",
      cancelledAt: new Date(),
      cancelledBy: "admin",
    };

    // Add tracking history
    order.trackingHistory.push({

      status: "Cancelled",
      updatedAt: new Date(),
      updatedBy: "admin"
    });

    await order.save();

    res.status(200).json({
      message:
        "Order cancelled successfully",
      order,
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      message:
        "Server error",
      error:
        err.message,
    });
  }
};


module.exports = {
  CreateOrder,
  GetMyOrders,
  GetSavedAddresses,
  GetSingleOrder,
  CancelOrder,
  GetAllOrders,
  UpdateOrder,
  GetAdminSingleOrder,
  AdminCancelOrder
};