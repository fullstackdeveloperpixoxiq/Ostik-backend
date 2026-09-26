const OrderSchema = require("../models/OrderSchema");
const ExchangeSchema = require("../models/ExchangeSchema");

// =====================================================
// CREATE EXCHANGE REQUEST
// =====================================================

const CreateExchange = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      orderId,
      orderItemId,
      quantity,
      exchangeProductId,
      exchangeVariantId,
      exchangeName,
      exchangeVariantName,
      exchangeSku,
      exchangeImage,
      reason,
      comment,
    } = req.body;

    if (
      !orderId ||
      !orderItemId ||
      !exchangeProductId ||
      !reason
    ) {
      return res.status(400).json({
        message: "Required exchange details are missing",
      });
    }

    const order = await OrderSchema.findOne({
      _id: orderId,
      user: userId,
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    // Exchange only after delivery
    if (order.orderStatus !== "Delivered") {
      return res.status(400).json({
        message: "Only delivered orders can be exchanged",
      });
    }

// Delivery date must exist
if (!order.deliveredAt) {
  return res.status(400).json({
    message: "Delivery date not available",
  });
}

// Exchange is allowed only within 7 days of delivery
const now = new Date();

const daysSinceDelivery =
  (now - new Date(order.deliveredAt)) /
  (1000 * 60 * 60 * 24);

if (daysSinceDelivery > 7) {
  return res.status(400).json({
    message: "Exchange period has expired. Exchanges are allowed only within 7 days of delivery.",
  });
}

    // Find exact ordered catalog item
    const orderItem = order.items.id(orderItemId);

    if (!orderItem) {
      return res.status(404).json({
        message: "Ordered product not found",
      });
    }

    const requestedQuantity = Number(quantity || 1);

    if (
      requestedQuantity < 1 ||
      requestedQuantity > orderItem.quantity
    ) {
      return res.status(400).json({
        message: "Invalid exchange quantity",
      });
    }

    // Prevent duplicate active exchange
    const existingExchange = await ExchangeSchema.findOne({
      order: orderId,
      user: userId,
      "item.orderItemId": orderItemId,
      status: {
        $in: [
          "Pending",
          "Approved",
          "Pickup Scheduled",
          "Received",
          "Replacement Shipped",
        ],
      },
    });

    if (existingExchange) {
      return res.status(400).json({
        message: "An exchange request already exists for this product",
      });
    }

    const exchangeRequest = await ExchangeSchema.create({
      order: orderId,
      user: userId,

      item: {
        orderItemId: orderItem._id,
        productId: orderItem.productId,
        variantId: orderItem.variantId,
        name: orderItem.name,
        variantName: orderItem.variantName,
        sku: orderItem.sku,
        image: orderItem.image,
        quantity: requestedQuantity,
        price: orderItem.price,
        finalPrice: orderItem.finalPrice,
      },

      exchangeItem: {
        productId: exchangeProductId,
        variantId: exchangeVariantId || null,
        name: exchangeName,
        variantName: exchangeVariantName || "",
        sku: exchangeSku || "",
        image: exchangeImage || "",
        price: Number(orderItem.finalPrice ?? orderItem.price),
      },

      reason,
      comment: comment || "",
    });

    res.status(201).json({
      message: "Exchange request created successfully",
      exchangeRequest,
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
// GET MY EXCHANGE REQUESTS
// =====================================================

const GetMyExchanges = async (req, res) => {
  try {
    const userId = req.user.userId;

    const exchanges = await ExchangeSchema.find({
      user: userId,
    })
      .populate("order", "_id orderStatus total placedAt")
      .sort({ createdAt: -1 });

    res.status(200).json({
      exchanges,
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
// GET SINGLE EXCHANGE
// =====================================================

const GetSingleExchange = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const exchangeRequest = await ExchangeSchema.findOne({
      _id: id,
      user: userId,
    }).populate("order", "_id orderStatus total placedAt");

    if (!exchangeRequest) {
      return res.status(404).json({
        message: "Exchange request not found",
      });
    }

    res.status(200).json({
      exchangeRequest,
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
// CANCEL EXCHANGE
// =====================================================

const CancelExchange = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const exchangeRequest = await ExchangeSchema.findOne({
      _id: id,
      user: userId,
    });

    if (!exchangeRequest) {
      return res.status(404).json({
        message: "Exchange request not found",
      });
    }

    if (exchangeRequest.status !== "Pending") {
      return res.status(400).json({
        message: "This exchange request cannot be cancelled",
      });
    }

    exchangeRequest.status = "Cancelled";

    await exchangeRequest.save();

    res.status(200).json({
      message: "Exchange request cancelled successfully",
      exchangeRequest,
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
// ADMIN - GET ALL EXCHANGES
// =====================================================

const GetAllExchanges = async (req, res) => {
  try {
    const exchanges = await ExchangeSchema.find()
      .populate("user", "name email")
      .populate("order", "_id total orderStatus placedAt")
      .sort({ createdAt: -1 });

    res.status(200).json({
      exchanges,
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
// ADMIN - UPDATE EXCHANGE STATUS
// =====================================================

const UpdateExchangeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminComment } = req.body;

    const exchangeRequest = await ExchangeSchema.findById(id);

    if (!exchangeRequest) {
      return res.status(404).json({
        message: "Exchange request not found",
      });
    }

    exchangeRequest.status = status;

    if (adminComment !== undefined) {
      exchangeRequest.adminComment = adminComment;
    }

    if (status === "Approved") {
      exchangeRequest.approvedAt = new Date();
    }

    if (status === "Completed") {
      exchangeRequest.completedAt = new Date();
    }

    await exchangeRequest.save();

    res.status(200).json({
      message: "Exchange status updated successfully",
      exchangeRequest,
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
// ADMIN - GET SINGLE EXCHANGE
// =====================================================

const GetAdminSingleExchange = async (req, res) => {
  try {
    const { id } = req.params;

    const exchangeRequest = await ExchangeSchema.findById(id)
      .populate("user", "name email")
      .populate("order", "_id total orderStatus placedAt");

    if (!exchangeRequest) {
      return res.status(404).json({
        message: "Exchange request not found",
      });
    }

    res.status(200).json({
      exchangeRequest,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

module.exports = {CreateExchange,GetMyExchanges,GetSingleExchange,CancelExchange,GetAllExchanges,
  UpdateExchangeStatus,GetAdminSingleExchange};