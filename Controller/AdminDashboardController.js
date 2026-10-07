const OrderSchema= require("../models/OrderSchema")
const UserSchema= require("../models/UserSchema")
const ProductSchema= require("../models/ProductSchema")
const VariantSchema= require("../models/VariantSchema")
const PaymentSchema= require("../models/PaymentSchema")
const ContactSchema= require("../models/ContactSchema")
const ReviewSchema= require("../models/ReviewSchema")
const AdminNotificationRead= require("../models/AdminNotificationSchema")



const GetDashboardStates= async(req,res)=>{
    try{
        //orders
        const TotalOrders= await OrderSchema.countDocuments();

        //sales
        const salesResult= await OrderSchema.aggregate([
            {
                $match: {
                    paymentStatus:"Paid",
                    orderStatus: {$ne: "Cancelled"}
                }
            },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: "$total" }
                }
            }
        ]);
        const totalSales= salesResult[0]?.totalSales || 0;

        //Customer
        const totalCustomers= await UserSchema.countDocuments({
            role:"user"
        })

        //products
        const totalProducts= await ProductSchema.countDocuments()

        //pending orders
        const PendingOrders= await OrderSchema.countDocuments({
            orderStatus:"Pending"
        })

        //Low stock
        const LowstockProducts= await VariantSchema.countDocuments({
            stock: {$lte:15},
            isActive: true
        })

        //response
        res.status(200).json({
            message:"Dashboard statistics fetched successfully",
            stats:{
                orders: TotalOrders,
                sales: totalSales,
                products: totalProducts,
                customers: totalCustomers,
                pendingOrders: PendingOrders,
                lowStock: LowstockProducts
            }
        })
    }
    catch(error){
        console.log("Dashboard stats error:", error);

        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
}

// =========================================================
// GET REVENUE UPDATES - ADMIN DASHBOARD
// =========================================================

const GetRevenueUpdates = async (req, res) => {
  try {
    const year = Number(req.query.year);

    if (!year || year < 2000) {
      return res.status(400).json({
        message: "Valid year is required",
      });
    }

    const startDate = new Date(
      `${year}-01-01T00:00:00.000Z`
    );

    const endDate = new Date(
      `${year + 1}-01-01T00:00:00.000Z`
    );

    const revenue = await OrderSchema.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },

          paymentStatus: "Paid",
        },
      },

      {
        $group: {
          _id: {
            month: {
              $month: "$createdAt",
            },

            paymentMethod: {
              $toLower: "$paymentMethod",
            },
          },

          total: {
            $sum: "$total",
          },
        },
      },

      {
        $sort: {
          "_id.month": 1,
        },
      },
    ]);

    // =====================================================
    // CREATE 12 MONTHS WITH 0 DEFAULT
    // =====================================================

    const monthlyRevenue = Array.from(
      { length: 12 },
      (_, index) => ({
        month: index + 1,
        onlineRevenue: 0,
        codRevenue: 0,
      })
    );

    // =====================================================
    // ADD DATABASE VALUES
    // =====================================================

    revenue.forEach((item) => {
      const monthIndex =
        item._id.month - 1;

      const paymentMethod =
        item._id.paymentMethod;

      if (
        paymentMethod === "razorpay"
      ) {
        monthlyRevenue[
          monthIndex
        ].onlineRevenue = Math.round(item.total);
      }

      if (
        paymentMethod === "cod"
      ) {
        monthlyRevenue[
          monthIndex
        ].codRevenue = Math.round(item.total);
      }
    });

    return res.status(200).json({
      message:
        "Revenue updates fetched successfully",

      year,

      months: [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ],

      revenue: monthlyRevenue,
    });
  } catch (error) {
    console.error(
      "Get Revenue Updates Error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to fetch revenue updates",

      error: error.message,
    });
  }
};

// =========================================================
// GET YEARLY REVENUE - ADMIN DASHBOARD
// =========================================================

const GetYearlyBreakup = async (req, res) => {
  try {
    const now = new Date();

    // =====================================================
    // CURRENT DATE - INDIA TIME
    // =====================================================

    const istParts = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(now);

    const getPart = (type) => {
      return Number(
        istParts.find((item) => item.type === type)?.value
      );
    };

    const currentYear = getPart("year");
    const currentMonth = getPart("month");
    const currentDay = getPart("day");
    const currentHour = getPart("hour");
    const currentMinute = getPart("minute");
    const currentSecond = getPart("second");

    const previousYear = currentYear - 1;


    // =====================================================
    // HELPER
    // IST DATE → UTC DATE
    // =====================================================

    const istToUTC = (
      year,
      month,
      day,
      hour = 0,
      minute = 0,
      second = 0
    ) => {
      return new Date(
        Date.UTC(
          year,
          month - 1,
          day,
          hour,
          minute,
          second
        ) -
          5.5 * 60 * 60 * 1000
      );
    };


    // =====================================================
    // CURRENT YEAR START
    // =====================================================

    const currentYearStart = istToUTC(
      currentYear,
      1,
      1
    );


    // =====================================================
    // PREVIOUS YEAR SAME PERIOD START
    // =====================================================

    const previousYearStart = istToUTC(
      previousYear,
      1,
      1
    );


    // =====================================================
    // PREVIOUS YEAR SAME DATE/TIME
    // =====================================================

    const previousYearSameDate = istToUTC(
      previousYear,
      currentMonth,
      currentDay,
      currentHour,
      currentMinute,
      currentSecond
    );


    // =====================================================
    // 1. YEARLY REVENUE
    // =====================================================

    const revenueData =
      await OrderSchema.aggregate([
        {
          $match: {
            paymentStatus: "Paid",
            createdAt: {
              $lte: now,
            },
          },
        },

        {
          $group: {
            _id: {
              year: {
                $year: {
                  date: "$createdAt",
                  timezone: "Asia/Kolkata",
                },
              },
            },

            totalRevenue: {
              $sum: "$total",
            },
          },
        },

        {
          $sort: {
            "_id.year": 1,
          },
        },
      ]);


    // =====================================================
    // ONLY YEARS WITH ACTUAL REVENUE
    // =====================================================

    const yearlyRevenue =
      revenueData
        .filter(
          (item) =>
            Number(item.totalRevenue || 0) > 0
        )
        .map((item) => ({
          year: item._id.year,

          totalRevenue: Math.round(
            Number(item.totalRevenue || 0)
          ),
        }));


    // =====================================================
    // CURRENT YEAR REVENUE
    // =====================================================

    const currentYearData =
      yearlyRevenue.find(
        (item) =>
          item.year === currentYear
      );

    const currentYearRevenue =
      currentYearData?.totalRevenue || 0;


    // =====================================================
    // 2. PREVIOUS YEAR SAME-PERIOD REVENUE
    // =====================================================

    const comparisonData =
      await OrderSchema.aggregate([
        {
          $match: {
            paymentStatus: "Paid",

            createdAt: {
              $gte: previousYearStart,
              $lte: previousYearSameDate,
            },
          },
        },

        {
          $group: {
            _id: null,

            totalRevenue: {
              $sum: "$total",
            },
          },
        },
      ]);


    const previousYearRevenue =
      Math.round(
        Number(
          comparisonData[0]?.totalRevenue || 0
        )
      );


    // =====================================================
    // 3. CHECK COMPARISON AVAILABILITY
    // =====================================================

    const comparisonAvailable =
      previousYearRevenue > 0;


    // =====================================================
    // 4. GROWTH PERCENTAGE
    // =====================================================

    let growthPercent = null;

    if (comparisonAvailable) {
      growthPercent = Math.round(
        ((currentYearRevenue -
          previousYearRevenue) /
          previousYearRevenue) *
          100
      );
    }


    // =====================================================
    // 5. YEARLY BREAKUP AVAILABILITY
    // =====================================================

    const hasYearlyBreakup =
      yearlyRevenue.length >= 2;


    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      message:
        "Yearly revenue fetched successfully",

      currentYear,

      currentYearRevenue,

      yearlyRevenue,

      comparison: {
        available:
          comparisonAvailable,

        previousYear,

        previousYearRevenue,

        growthPercent,

        label: comparisonAvailable
          ? "vs same period last year"
          : "Comparison will be available after enough historical data is available",
      },

      hasYearlyBreakup,
    });

  } catch (error) {
    console.error(
      "Get Yearly Breakup Error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to fetch yearly revenue",

      error: error.message,
    });
  }
};

// =========================================================
// GET MONTHLY EARNINGS - ADMIN DASHBOARD
// =========================================================

const GetMonthlyEarning = async (req, res) => {
  try {
    const now = new Date();

    // =====================================================
    // INDIA DATE PARTS
    // =====================================================

    const istParts = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);

    const getPart = (type) =>
      Number(
        istParts.find(
          (item) => item.type === type
        )?.value
      );

    const currentYear = getPart("year");
    const currentMonth = getPart("month");
    const currentDay = getPart("day");


    // =====================================================
    // IST → UTC HELPER
    // =====================================================

    const istToUTC = (
      year,
      month,
      day,
      hour = 0,
      minute = 0,
      second = 0
    ) => {
      return new Date(
        Date.UTC(
          year,
          month - 1,
          day,
          hour,
          minute,
          second
        ) -
          5.5 * 60 * 60 * 1000
      );
    };


    // =====================================================
    // CURRENT MONTH RANGE
    // =====================================================

    const monthStart = istToUTC(
      currentYear,
      currentMonth,
      1
    );

    const nextMonthStart =
      currentMonth === 12
        ? istToUTC(
            currentYear + 1,
            1,
            1
          )
        : istToUTC(
            currentYear,
            currentMonth + 1,
            1
          );


    // =====================================================
    // CURRENT MONTH TOTAL REVENUE
    // =====================================================

    const monthlyTotal =
      await OrderSchema.aggregate([
        {
          $match: {
            paymentStatus: "Paid",

            createdAt: {
              $gte: monthStart,
              $lt: nextMonthStart,
            },
          },
        },

        {
          $group: {
            _id: null,

            totalRevenue: {
              $sum: "$total",
            },
          },
        },
      ]);


    const totalRevenue = Math.round(
      Number(
        monthlyTotal[0]?.totalRevenue || 0
      )
    );


    // =====================================================
    // LAST 7 DAYS RANGE
    // ====================================================

    // For current month, use actual last 7 calendar days.
    const last7DaysStart = istToUTC(
      currentYear,
      currentMonth,
      Math.max(
        1,
        currentDay - 6
      )
    );

    const last7DaysEnd =
      istToUTC(
        currentYear,
        currentMonth,
        currentDay,
        23,
        59,
        59
      );


    // =====================================================
    // LAST 7 DAYS REVENUE
    // =====================================================

    const dailyRevenue =
      await OrderSchema.aggregate([
        {
          $match: {
            paymentStatus: "Paid",

            createdAt: {
              $gte: last7DaysStart,
              $lte: last7DaysEnd,
            },
          },
        },

        {
          $group: {
            _id: {
              day: {
                $dayOfMonth: {
                  date: "$createdAt",
                  timezone: "Asia/Kolkata",
                },
              },

              month: {
                $month: {
                  date: "$createdAt",
                  timezone: "Asia/Kolkata",
                },
              },

              year: {
                $year: {
                  date: "$createdAt",
                  timezone: "Asia/Kolkata",
                },
              },
            },

            revenue: {
              $sum: "$total",
            },
          },
        },

        {
          $sort: {
            "_id.year": 1,
            "_id.month": 1,
            "_id.day": 1,
          },
        },
      ]);


    // =====================================================
    // CREATE LAST 7 DAYS WITH 0 DEFAULT
    // =====================================================

    const last7Days = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);

      date.setDate(
        date.getDate() - i
      );

      const year = Number(
        new Intl.DateTimeFormat(
          "en-IN",
          {
            timeZone: "Asia/Kolkata",
            year: "numeric",
          }
        ).format(date)
      );

      const month = Number(
        new Intl.DateTimeFormat(
          "en-IN",
          {
            timeZone: "Asia/Kolkata",
            month: "2-digit",
          }
        ).format(date)
      );

      const day = Number(
        new Intl.DateTimeFormat(
          "en-IN",
          {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
          }
        ).format(date)
      );

      const found =
        dailyRevenue.find(
          (item) =>
            item._id.year === year &&
            item._id.month === month &&
            item._id.day === day
        );

      last7Days.push({
        date: `${year}-${String(
          month
        ).padStart(2, "0")}-${String(
          day
        ).padStart(2, "0")}`,

        label: new Intl.DateTimeFormat(
          "en-IN",
          {
            timeZone: "Asia/Kolkata",
            weekday: "short",
          }
        ).format(date),

        revenue: Math.round(
          Number(
            found?.revenue || 0
          )
        ),
      });
    }


    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      message:
        "Monthly earnings fetched successfully",

      month: currentMonth,

      year: currentYear,

      monthName:
        new Intl.DateTimeFormat(
          "en-IN",
          {
            timeZone: "Asia/Kolkata",
            month: "long",
          }
        ).format(now),

      totalRevenue,

      last7Days,
    });
  } catch (error) {
    console.error(
      "Get Monthly Earning Error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to fetch monthly earnings",

      error: error.message,
    });
  }
};

// =========================================================
// GET RECENT TRANSACTIONS - ADMIN DASHBOARD
// =========================================================

const GetRecentTransactions = async (req, res) => {
  try {
    const payments = await PaymentSchema.find({})
      .populate("user", "name email")
      .populate("order", "_id orderStatus paymentStatus")
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    const transactions = payments.map((payment) => ({
      id: payment._id,

      orderId: payment.order?._id || null,

      customerName:
        payment.user?.name || "Customer",

      amount: Math.round(
        Number(payment.amount || 0)
      ),

      currency:
        payment.currency || "INR",

      paymentMethod:
        payment.paymentGateway || "Unknown",

      status:
        payment.status || "Pending",

      createdAt:
        payment.createdAt,
    }));

    return res.status(200).json({
      message:
        "Recent transactions fetched successfully",

      transactions,
    });
  } catch (error) {
    console.error(
      "Get Recent Transactions Error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to fetch recent transactions",

      error: error.message,
    });
  }
};

// =========================================================
// GET PRODUCT PERFORMANCE - ADMIN DASHBOARD
// =========================================================

const GetProductPerformance = async (req, res) => {
  try {
    // =====================================================
    // 1. GET PRODUCT-WISE SALES
    // =====================================================

    const productSales = await OrderSchema.aggregate([
  {
    $match: {
      paymentStatus: "Paid",
      orderStatus: {
        $nin: ["Cancelled", "Returned"],
      },
    },
  },

  {
    $unwind: "$items",
  },

  // Ignore old/invalid order items
  // where productId is missing or null
  {
    $match: {
      "items.productId": {
        $ne: null,
      },
    },
  },

  {
    $group: {
      _id: "$items.productId",

          // Count unique orders for this product
          orderIds: {
            $addToSet: "$_id",
          },

          // Total quantity sold
          unitsSold: {
            $sum: "$items.quantity",
          },

          // Actual selling revenue
          revenue: {
            $sum: {
              $multiply: [
                "$items.finalPrice",
                "$items.quantity",
              ],
            },
          },
        },
      },

      // Highest revenue first
      {
        $sort: {
          revenue: -1,
        },
      },

      // Top 5 products
      {
        $limit: 5,
      },
    ]);


    // =====================================================
    // 2. GET PRODUCT IDs
    // =====================================================

    const productIds =
      productSales.map(
        (item) => item._id
      );


    // No sales yet
    if (productIds.length === 0) {
      return res.status(200).json({
        message:
          "Product performance fetched successfully",

        products: [],
      });
    }


    // =====================================================
    // 3. GET PRODUCT DETAILS
    // =====================================================

    const products =
      await ProductSchema.find({
        _id: {
          $in: productIds,
        },
      }).select(
        "name slug images status"
      );


    // =====================================================
    // 4. GET CURRENT STOCK
    //    Sum stock of ACTIVE variants
    // =====================================================

    const stockData =
      await VariantSchema.aggregate([
        {
          $match: {
            product: {
              $in: productIds,
            },

            isActive: true,
          },
        },

        {
          $group: {
            _id: "$product",

            stock: {
              $sum: "$stock",
            },
          },
        },
      ]);


    // =====================================================
    // 5. MAP STOCK FOR EASY LOOKUP
    // =====================================================

    const stockMap = new Map();

    stockData.forEach((item) => {
      stockMap.set(
        item._id.toString(),
        Math.round(
          Number(item.stock || 0)
        )
      );
    });


    // =====================================================
    // 6. COMBINE EVERYTHING
    // =====================================================

    const performance = productSales
  .filter((sale) => sale._id)
  .map((sale) => {
    const product = products.find(
      (item) =>
        item._id.toString() ===
        sale._id.toString()
    );

    return {
      productId: sale._id,

      productName:
        product?.name ||
        "Unknown Product",

      productSlug:
        product?.slug || "",

      image:
        product?.images?.[0] || "",

      orders:
        sale.orderIds.length,

      unitsSold:
        Math.round(
          Number(sale.unitsSold || 0)
        ),

      revenue:
        Math.round(
          Number(sale.revenue || 0)
        ),

      stock:
        stockMap.get(
          sale._id.toString()
        ) || 0,
    };
  });


    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      message:
        "Product performance fetched successfully",

      products: performance,
    });

  } catch (error) {
    console.error(
      "Get Product Performance Error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to fetch product performance",

      error: error.message,
    });
  }
};

// =========================================================
// GET ADMIN NOTIFICATIONS
// =========================================================

const GetAdminNotifications = async (req, res) => {
  try {
    const [
      orders,
      contacts,
      reviews,
      lowStockVariants,
    ] = await Promise.all([
      // -----------------------------------------------------
      // RECENT ORDERS
      // -----------------------------------------------------
      OrderSchema.find({})
        .sort({ createdAt: -1 })
        .limit(20)
        .populate("user", "name email")
        .lean(),

      // -----------------------------------------------------
      // UNREAD CONTACT MESSAGES
      // -----------------------------------------------------
      ContactSchema.find({
        status: "unread",
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),

      // -----------------------------------------------------
      // RECENT REVIEWS
      // -----------------------------------------------------
      ReviewSchema.find({})
        .sort({ createdAt: -1 })
        .limit(20)
        .populate("user", "name")
        .populate("product", "name")
        .lean(),

      // -----------------------------------------------------
      // LOW STOCK VARIANTS
      // -----------------------------------------------------
      VariantSchema.find({
        isActive: true,
        stock: {
          $gt: 0,
          $lte: 5,
        },
      })
        .sort({
          stock: 1,
          updatedAt: -1,
        })
        .limit(20)
        .populate("product", "name")
        .lean(),
    ]);

    // =====================================================
    // CREATE NOTIFICATIONS ARRAY
    // =====================================================

    const notifications = [];

    // =====================================================
    // ORDER NOTIFICATIONS
    // =====================================================

    orders.forEach((order) => {
      notifications.push({
        id: `order-${order._id}`,

        type: "order",

        title: "New Order",

        subtitle: order.user?.name
          ? `${order.user.name} placed an order`
          : "A new order has been placed",

        time: order.createdAt,

        href: "/orders",

        icon: "solar:bag-4-line-duotone",

        color: "text-primary",

        bgcolor:
          "bg-lightprimary dark:bg-lightprimary",
      });
    });

    // =====================================================
    // CONTACT NOTIFICATIONS
    // =====================================================

    contacts.forEach((contact) => {
      notifications.push({
        id: `contact-${contact._id}`,

        type: "contact",

        title: "New Contact Message",

        subtitle: `${contact.name} sent a message`,

        time: contact.createdAt,

        href: `/contacts/${contact._id}`,

        icon: "solar:letter-line-duotone",

        color: "text-warning",

        bgcolor:
          "bg-lightwarning dark:bg-lightwarning",
      });
    });

    // =====================================================
    // REVIEW NOTIFICATIONS
    // =====================================================

    reviews.forEach((review) => {
      notifications.push({
        id: `review-${review._id}`,

        type: "review",

        title: "New Product Review",

        subtitle: review.product?.name
          ? `${review.user?.name || "Customer"} reviewed ${review.product.name}`
          : "A customer added a product review",

        time: review.createdAt,

        href: `/reviews/${review._id}`,

        icon: "solar:star-line-duotone",

        color: "text-secondary",

        bgcolor:
          "bg-lightsecondary dark:bg-lightsecondary",
      });
    });

    // =====================================================
    // LOW STOCK NOTIFICATIONS
    // =====================================================

    lowStockVariants.forEach((variant) => {
      notifications.push({
        id: `stock-${variant._id}`,

        type: "stock",

        title: "Low Stock",

        subtitle: `${
          variant.product?.name || "Product"
        } - ${variant.name} (${variant.stock} left)`,

        time: variant.updatedAt,

        href: `/variants/${variant._id}`,

        icon: "solar:box-minimalistic-line-duotone",

        color: "text-error",

        bgcolor:
          "bg-lighterror dark:bg-lighterror",
      });
    });

    // =====================================================
    // SORT ALL NOTIFICATIONS
    // =====================================================

    notifications.sort(
      (a, b) =>
        new Date(b.time).getTime() -
        new Date(a.time).getTime()
    );

    // =====================================================
    // GET ADMIN ID
    // =====================================================

    const adminId =
      req.user?.id ||
      req.user?.userId ||
      req.user?._id;

    if (!adminId) {
      return res.status(401).json({
        message: "Admin ID not found in token",
      });
    }

    // =====================================================
    // GET ALL NOTIFICATION IDS
    // =====================================================

    const notificationIds = notifications.map(
      (notification) => notification.id
    );

    // =====================================================
    // GET READ NOTIFICATIONS FROM DATABASE
    // =====================================================

    const readNotifications =
      await AdminNotificationRead.find({
        admin: adminId,

        notificationId: {
          $in: notificationIds,
        },
      }).lean();

    // =====================================================
    // CREATE SET OF READ NOTIFICATION IDS
    // =====================================================

    const readNotificationIds = new Set(
      readNotifications.map(
        (item) => item.notificationId
      )
    );

    // =====================================================
    // FILTER ONLY UNREAD NOTIFICATIONS
    // =====================================================

    const unreadNotifications =
      notifications.filter(
        (notification) =>
          !readNotificationIds.has(
            notification.id
          )
      );

    // =====================================================
    // SHOW ONLY LATEST 8 UNREAD NOTIFICATIONS
    // =====================================================

    const latestNotifications =
      unreadNotifications.slice(0, 8);

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      message:
        "Admin notifications fetched successfully",

      // Total unread notifications
      count: unreadNotifications.length,

      // Only latest 8 shown in dropdown
      notifications: latestNotifications,
    });
  } catch (error) {
    console.error(
      "Get Admin Notifications Error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to fetch admin notifications",

      error: error.message,
    });
  }
};


const MarkAdminNotificationAsRead = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const adminId =
      req.user?.id ||
      req.user?.userId ||
      req.user?._id;

    if (!adminId) {
      return res.status(401).json({
        message: "Admin ID not found in token",
      });
    }

    if (!id) {
      return res.status(400).json({
        message: "Notification ID is required",
      });
    }

    await AdminNotificationRead.findOneAndUpdate(
      {
        admin: adminId,
        notificationId: id,
      },
      {
        admin: adminId,
        notificationId: id,
        readAt: new Date(),
      },
      {
        upsert: true,
      }
    );

    return res.status(200).json({
      message:
        "Notification marked as read",
    });
  } catch (error) {
    console.error(
      "Mark notification as read error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to mark notification as read",
      error: error.message,
    });
  }
};

module.exports= {GetDashboardStates,GetRevenueUpdates,GetYearlyBreakup,GetMonthlyEarning,
    GetRecentTransactions, GetProductPerformance, GetAdminNotifications, MarkAdminNotificationAsRead
}