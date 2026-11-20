const Banner = require("../models/BannerSchema");
const cloudinary= require("../Config/Cloudinary")

// Upload one in-memory file to Cloudinary and return its URL.
const uploadBannerImage = (file) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "ostik/banners", resource_type: "image" },
      (error, result) => (error ? reject(error) : resolve(result.secure_url))
    );
    stream.end(file.buffer);
  });

// Works with upload.fields() (req.files) and the old upload.single() (req.file).
const getFile = (req, name) =>
  req.files?.[name]?.[0] || (name === "image" ? req.file : undefined);

// Delete a banner image from Cloudinary, but only when no other banner
// (desktop or mobile) still points at the same URL. Failures are logged and
// never block the request; non-Cloudinary URLs are left alone.
const destroyBannerImageIfUnused = async (url, excludeId) => {
  try {
    if (!url || !url.includes("res.cloudinary.com")) return;

    const stillUsed = await Banner.exists({
      _id: { $ne: excludeId },
      $or: [{ image: url }, { mobileImage: url }],
    });
    if (stillUsed) return;

    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^./]+)?$/);
    if (!match) return;

    await cloudinary.uploader.destroy(match[1], { resource_type: "image" });
  } catch (error) {
    console.log("Failed to delete Cloudinary banner image:", error.message);
  }
};


// =====================================
// CREATE BANNER - ADMIN
// =====================================
const CreateBanner = async (req, res) => {
  try {
    console.log("BODY:", req.body);
    console.log("FILES:", Object.keys(req.files || {}));

    const {
      title,
      subtitle,
      buttonText,
      buttonLink,
      category,
      displayOrder,
      imagePosition,
      mobileImagePosition,
    } = req.body;

    const imageFile = getFile(req, "image");
    const mobileFile = getFile(req, "mobileImage");

    // Check title
    if (!title) {
      return res.status(400).json({
        message: "Title is required",
      });
    }

    // Check image
    if (!imageFile) {
      return res.status(400).json({
        message: "Banner image is required",
      });
    }

    // Upload image(s) to Cloudinary
    const [imageUrl, mobileImageUrl] = await Promise.all([
      uploadBannerImage(imageFile),
      mobileFile ? uploadBannerImage(mobileFile) : Promise.resolve(""),
    ]);

    // Create banner in MongoDB
    const banner = await Banner.create({
      title,
      subtitle,
      image: imageUrl,
      mobileImage: mobileImageUrl,
      imagePosition: imagePosition || "center",
      mobileImagePosition: mobileImagePosition || "center",
      buttonText,
      buttonLink,
      category: category || null,
      displayOrder: displayOrder || 0,
    });

    return res.status(201).json({
      message: "Banner created successfully",
      banner,
    });

  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


// =====================================
// GET ALL BANNERS - ADMIN
// =====================================
const GetAllBanners = async (req, res) => {
  try {
    const banners = await Banner.find()
      .populate("category", "name")
      .sort({ displayOrder: 1 });

    return res.status(200).json({
      message: "Banners fetched successfully",
      banners,
    });

  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


// =====================================
// GET ACTIVE BANNERS - USER
// =====================================
const GetActiveBanners = async (req, res) => {
  try {
    const banners = await Banner.find({
      status: "active",
    })
      .populate("category", "name")
      .sort({ displayOrder: 1 });

    return res.status(200).json({
      message: "Active banners fetched successfully",
      banners,
    });

  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


// =====================================
// UPDATE BANNER - ADMIN
// =====================================
const UpdateBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await Banner.findById(id)

    if (!banner) {
      return res.status(404).json({
        message: "Banner not found",
      });
    }

    const {
      title,
      subtitle,
      buttonText,
      buttonLink,
      category,
      displayOrder,
      status,
      imagePosition,
      mobileImagePosition,
      removeMobileImage,
    } = req.body;

    // Update text fields
    if (title !== undefined) {
      banner.title = title;
    }

    if (subtitle !== undefined) {
      banner.subtitle = subtitle;
    }

    if (buttonText !== undefined) {
      banner.buttonText = buttonText;
    }

    if (buttonLink !== undefined) {
      banner.buttonLink = buttonLink;
    }

    if (category !== undefined) {
      banner.category = category || null;
    }

    if (displayOrder !== undefined) {
      banner.displayOrder = Number(displayOrder);
    }

    if (status !== undefined) {
      banner.status = status;
    }

    if (imagePosition !== undefined) {
      banner.imagePosition = imagePosition || "center";
    }

    if (mobileImagePosition !== undefined) {
      banner.mobileImagePosition = mobileImagePosition || "center";
    }

    const previousImage = banner.image;
    const previousMobileImage = banner.mobileImage;

    if (removeMobileImage === "true" || removeMobileImage === true) {
      banner.mobileImage = "";
    }

    // Replace images only when new files are selected
    const imageFile = getFile(req, "image");
    const mobileFile = getFile(req, "mobileImage");

    const [newImage, newMobileImage] = await Promise.all([
      imageFile ? uploadBannerImage(imageFile) : Promise.resolve(null),
      mobileFile ? uploadBannerImage(mobileFile) : Promise.resolve(null),
    ]);

    if (newImage) banner.image = newImage;
    if (newMobileImage) banner.mobileImage = newMobileImage;

    await banner.save();

    // Clean up images this banner no longer uses (after the save succeeds).
    const kept = [banner.image, banner.mobileImage];
    await Promise.all(
      [...new Set([previousImage, previousMobileImage])]
        .filter((url) => url && !kept.includes(url))
        .map((url) => destroyBannerImageIfUnused(url, banner._id))
    );

    return res.status(200).json({
      message: "Banner updated successfully",
      banner,
    });

  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


// =====================================
// DELETE BANNER - ADMIN
// =====================================
const DeleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await Banner.findByIdAndDelete(id);

    if (!banner) {
      return res.status(404).json({
        message: "Banner not found",
      });
    }

    await Promise.all(
      [...new Set([banner.image, banner.mobileImage])].map((url) =>
        destroyBannerImageIfUnused(url, banner._id)
      )
    );

    return res.status(200).json({
      message: "Banner deleted successfully",
    });

  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


module.exports = {CreateBanner,GetAllBanners,GetActiveBanners,UpdateBanner,DeleteBanner,};