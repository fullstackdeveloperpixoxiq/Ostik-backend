const NewsletterSubscriber = require("../models/NewsletterSchema");

// Subscribe to newsletter
const subscribeNewsletter = async (req, res) => {
  try {
    const { email } = req.body;

    // Check email
    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    // Check if already subscribed
    const existingSubscriber = await NewsletterSubscriber.findOne({ email });

    if (existingSubscriber) {
      // If previously unsubscribed, activate again
      if (!existingSubscriber.isActive) {
        existingSubscriber.isActive = true;
        existingSubscriber.subscribedAt = new Date();

        await existingSubscriber.save();

        return res.status(200).json({
          message: "You have successfully subscribed to our newsletter",
        });
      }

      return res.status(409).json({
        message: "This email is already subscribed",
      });
    }

    // Create new subscriber
    const subscriber = await NewsletterSubscriber.create({
      email,
    });

    return res.status(201).json({
      message: "You have successfully subscribed to our newsletter",
      subscriber: {
        id: subscriber._id,
        email: subscriber.email,
      },
    });
  } catch (error) {
    console.error("Newsletter subscription error:", error);

    return res.status(500).json({
      message: "Something went wrong. Please try again",
    });
  }
};


const GetAllNewsletterSubscribers = async (
  req,
  res
) => {
  try {
    const subscribers =
      await NewsletterSubscriber.find({})
        .sort({ subscribedAt: -1 });

    return res.status(200).json({
      message:
        "Newsletter subscribers fetched successfully",
      subscribers,
    });
  } catch (error) {
    console.error(
      "Get newsletter subscribers error:",
      error
    );

    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};


// =========================================================
// GET SINGLE NEWSLETTER SUBSCRIBER - ADMIN
// =========================================================

const GetNewsletterSubscriber = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const subscriber =
      await NewsletterSubscriber.findById(id);

    if (!subscriber) {
      return res.status(404).json({
        message: "Subscriber not found",
      });
    }

    return res.status(200).json({
      message:
        "Subscriber fetched successfully",
      subscriber,
    });
  } catch (error) {
    console.error(
      "Get newsletter subscriber error:",
      error
    );

    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};


// =========================================================
// TOGGLE NEWSLETTER STATUS - ADMIN
// =========================================================

const ToggleNewsletterStatus = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const subscriber =
      await NewsletterSubscriber.findById(id);

    if (!subscriber) {
      return res.status(404).json({
        message: "Subscriber not found",
      });
    }

    subscriber.isActive =
      !subscriber.isActive;

    await subscriber.save();

    return res.status(200).json({
      message: subscriber.isActive
        ? "Subscriber activated successfully"
        : "Subscriber deactivated successfully",

      subscriber,
    });
  } catch (error) {
    console.error(
      "Toggle newsletter status error:",
      error
    );

    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  subscribeNewsletter, GetAllNewsletterSubscribers, GetNewsletterSubscriber,ToggleNewsletterStatus
};