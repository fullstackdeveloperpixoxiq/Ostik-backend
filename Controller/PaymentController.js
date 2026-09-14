const Razorpay = require("razorpay");
const crypto = require("crypto");

const PaymentSchema = require("../models/PaymentSchema");
const OrderSchema = require("../models/OrderSchema");
const CartSchema = require("../models/CartSchema");
const VariantSchema = require("../models/VariantSchema");

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});


// CREATE RAZORPAY ORDER
const CreatePayment = async (req, res) => {
    try {

        const userId = req.user.userId;

        const { orderId } = req.body;

        // Find order
        const order = await OrderSchema.findOne({
            _id: orderId,
            user: userId
        });

        if (!order) {
            return res.status(404).json({
                message: "Order not found"
            });
        }

        // Only Razorpay orders
        if (order.paymentMethod !== "razorpay") {
            return res.status(400).json({
                message: "This order is not a Razorpay order"
            });
        }

        // Don't pay already paid order
        if (order.paymentStatus === "Paid") {
            return res.status(400).json({
                message: "Order is already paid"
            });
        }

        // Amount in smallest currency unit
        const amount = Math.round(order.total * 100);

        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: amount,
            currency: order.currency,
            receipt: order._id.toString()
        });

        // Save payment record
        const payment = await PaymentSchema.create({
            order: order._id,
            user: userId,
            paymentGateway: "razorpay",
            amount: order.total,
            currency: order.currency,
            status: "Pending",
            razorpayOrderId: razorpayOrder.id
        });

        res.status(201).json({
            message: "Payment order created successfully",

            payment: {
                paymentId: payment._id,
                razorpayOrderId: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency
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


// VERIFY RAZORPAY PAYMENT
const VerifyPayment = async (req, res) => {
    try {

        const userId = req.user.userId;

        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        if (
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature
        ) {
            return res.status(400).json({
                message: "Payment details are required"
            });
        }


        // Find payment
        const payment = await PaymentSchema.findOne({
            razorpayOrderId: razorpay_order_id,
            user: userId
        });

        if (!payment) {
            return res.status(404).json({
                message: "Payment record not found"
            });
        }


        // Prevent duplicate verification
        if (payment.status === "Success") {
            return res.status(200).json({
                message: "Payment already verified",
                payment
            });
        }


        // Create signature
        const generatedSignature = crypto
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(
                razorpay_order_id + "|" + razorpay_payment_id
            )
            .digest("hex");


        // Compare signatures
        if (generatedSignature !== razorpay_signature) {

            payment.status = "Failed";
            payment.failureReason = "Invalid payment signature";

            await payment.save();

            return res.status(400).json({
                message: "Payment verification failed"
            });
        }


        // Find the related order
        const order = await OrderSchema.findOne({
            _id: payment.order,
            user: userId
        });

        if (!order) {
            return res.status(404).json({
                message: "Order not found"
            });
        }


        // Prevent duplicate order payment update
        if (order.paymentStatus === "Paid") {

            payment.status = "Success";
            payment.razorpayPaymentId = razorpay_payment_id;
            payment.razorpaySignature = razorpay_signature;
            payment.transactionId = razorpay_payment_id;
            payment.paidAt = new Date();

            await payment.save();

            return res.status(200).json({
                message: "Payment already completed",
                payment
            });
        }


        // ----------------------------------------
        // CHECK STOCK AGAIN
        // ----------------------------------------

        for (const item of order.items) {

            const variant = await VariantSchema.findById(
                item.variantId
            );

            if (!variant) {
                return res.status(404).json({
                    message: `Variant not found for ${item.name}`
                });
            }

            if (!variant.isActive) {
                return res.status(400).json({
                    message: `${item.name} variant is inactive`
                });
            }

            if (variant.stock < item.quantity) {
                return res.status(400).json({
                    message: `${item.name} has only ${variant.stock} items available`
                });
            }
        }


        // ----------------------------------------
        // REDUCE STOCK
        // ----------------------------------------

        for (const item of order.items) {

            await VariantSchema.findByIdAndUpdate(
                item.variantId,
                {
                    $inc: {
                        stock: -item.quantity
                    }
                }
            );
        }


        // ----------------------------------------
        // UPDATE PAYMENT
        // ----------------------------------------

        payment.status = "Success";
        payment.razorpayPaymentId = razorpay_payment_id;
        payment.razorpaySignature = razorpay_signature;
        payment.transactionId = razorpay_payment_id;
        payment.paidAt = new Date();

        await payment.save();


        // ----------------------------------------
        // UPDATE ORDER
        // ----------------------------------------

        order.paymentStatus = "Paid";
        order.orderStatus = "Processing";

        await order.save();


        // ----------------------------------------
        // REMOVE ORDERED ITEMS FROM CART
        // ----------------------------------------

        const cart = await CartSchema.findOne({
            user: userId
        });

        if (cart) {

            const orderedVariantIds = order.items.map(
                item => item.variantId.toString()
            );

            cart.items = cart.items.filter(
                item =>
                    !orderedVariantIds.includes(
                        item.variant.toString()
                    )
            );

            await cart.save();
        }


        // ----------------------------------------
        // SUCCESS RESPONSE
        // ----------------------------------------

        return res.status(200).json({
            message: "Payment verified successfully",
            payment,
            order
        });


    } catch (err) {

        console.log(err);

        return res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


// GET MY PAYMENTS
const GetMyPayments = async (req, res) => {
    try {

        const userId = req.user.userId;

        const payments = await PaymentSchema.find({
            user: userId
        })
            .populate("order")
            .sort({ createdAt: -1 });

        res.status(200).json({
            message: "Payments fetched successfully",
            payments
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};


module.exports = {CreatePayment,GetMyPayments,VerifyPayment};