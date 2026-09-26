const OrderSchema = require("../models/OrderSchema");
const ReturnSchema = require("../models/ReturnSchema");

// =====================================================
// CREATE RETURN REQUEST
// =====================================================

const CreateReturn = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      orderId,
      orderItemId,
      quantity,
      reason,
      comment,
    } = req.body;

    if (!orderId || !orderItemId || !reason) {
      return res.status(400).json({
        message: "Order, product and return reason are required",
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

    // Return only allowed for delivered orders
    if (order.orderStatus !== "Delivered") {
      return res.status(400).json({
        message: "Only delivered orders can be returned",
      });
    }

    // Delivery date must exist
if (!order.deliveredAt) {
  return res.status(400).json({
    message: "Delivery date not available",
  });
}

// Return is allowed only within 7 days of delivery
const now = new Date();

const daysSinceDelivery =
  (now - new Date(order.deliveredAt)) /
  (1000 * 60 * 60 * 24);

if (daysSinceDelivery > 7) {
  return res.status(400).json({
    message: "Return period has expired. Returns are allowed only within 7 days of delivery.",
  });
}

    // Find the exact product/catalog inside the order
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
        message: "Invalid return quantity",
      });
    }

    // Check existing return requests for same item
    const existingReturn = await ReturnSchema.findOne({
      order: orderId,
      user: userId,
      "item.orderItemId": orderItemId,
      status: {
        $in: [
          "Pending",
          "Approved",
          "Picked Up",
          "Received",
        ],
      },
    });

    if (existingReturn) {
      return res.status(400).json({
        message: "A return request already exists for this product",
      });
    }

    const returnRequest = await ReturnSchema.create({
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

      reason,
      comment: comment || "",
    });

    res.status(201).json({
      message: "Return request created successfully",
      returnRequest,
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
// GET MY RETURN REQUESTS
// =====================================================

const GetMyReturns = async (req, res) => {
  try {
    const userId = req.user.userId;

    const returns = await ReturnSchema.find({
      user: userId,
    })
      .populate("order", "_id orderStatus total placedAt")
      .sort({ createdAt: -1 });

    res.status(200).json({
      returns,
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
// GET SINGLE RETURN
// =====================================================

const GetSingleReturn = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const returnRequest = await ReturnSchema.findOne({
      _id: id,
      user: userId,
    }).populate("order", "_id orderStatus total placedAt");

    if (!returnRequest) {
      return res.status(404).json({
        message: "Return request not found",
      });
    }

    res.status(200).json({
      returnRequest,
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
// CANCEL RETURN REQUEST
// =====================================================

const CancelReturn = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const returnRequest = await ReturnSchema.findOne({
      _id: id,
      user: userId,
    });

    if (!returnRequest) {
      return res.status(404).json({
        message: "Return request not found",
      });
    }

    if (returnRequest.status !== "Pending") {
      return res.status(400).json({
        message: "This return request cannot be cancelled",
      });
    }

    returnRequest.status = "Cancelled";

    await returnRequest.save();

    res.status(200).json({
      message: "Return request cancelled successfully",
      returnRequest,
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
// ADMIN - GET ALL RETURNS
// =====================================================

const GetAllReturns = async (req, res) => {
  try {
    const returns = await ReturnSchema.find()
      .populate("user", "name email")
      .populate("order", "_id total orderStatus placedAt")
      .sort({ createdAt: -1 });

    res.status(200).json({
      returns,
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
// ADMIN - GET SINGLE RETURN
// =====================================================

const GetAdminSingleReturn = async (req, res) => {
  try {
    const { id } = req.params;

    const returnRequest = await ReturnSchema.findById(id)
      .populate("user", "name email")
      .populate("order", "_id total orderStatus placedAt");

    if (!returnRequest) {
      return res.status(404).json({
        message: "Return request not found",
      });
    }

    res.status(200).json({
      returnRequest,
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
// ADMIN - UPDATE RETURN STATUS
// =====================================================

const UpdateReturnStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminComment } = req.body;

    const returnRequest = await ReturnSchema.findById(id);

    if (!returnRequest) {
      return res.status(404).json({
        message: "Return request not found",
      });
    }

    returnRequest.status = status;

    if (adminComment !== undefined) {
      returnRequest.adminComment = adminComment;
    }

    if (status === "Approved") {
      returnRequest.approvedAt = new Date();
    }

    if (status === "Refunded") {
      returnRequest.completedAt = new Date();
    }

    await returnRequest.save();

    res.status(200).json({
      message: "Return status updated successfully",
      returnRequest,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


module.exports = {CreateReturn,GetMyReturns,GetSingleReturn,CancelReturn,GetAllReturns,UpdateReturnStatus,
  GetAdminSingleReturn
};