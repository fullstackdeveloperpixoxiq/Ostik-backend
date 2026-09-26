const VideoSection = require("../models/VideoSectionSchema");
const cloudinary = require("../Config/Cloudinary");

// =========================================================
// CREATE VIDEO SECTION - ADMIN
// =========================================================
const createVideoSection = async (req, res) => {
  try {
    const {
      title,
      description,
      videoUrl,
      buttonText,
      buttonLink,
      isActive,
    } = req.body;

    // Only one video section should exist
    const existingSection = await VideoSection.findOne();

    if (existingSection) {
      return res.status(409).json({
        success: false,
        message: "Video section already exists. Please edit the existing section.",
      });
    }

    let finalVideoUrl = videoUrl?.trim() || "";

    // Upload video file if provided
    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: "video",
            folder: "ostik/videos",
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        );

        stream.end(req.file.buffer);
      });

      finalVideoUrl = uploadResult.secure_url;
    }

    if (!finalVideoUrl) {
      return res.status(400).json({
        success: false,
        message: "Please provide a YouTube URL or upload a video",
      });
    }

    const videoSection = await VideoSection.create({
      title,
      description,
      videoUrl: finalVideoUrl,
      buttonText: buttonText || "Explore Products",
      buttonLink: buttonLink || "/products",
      isActive:
        isActive === "true" ||
        isActive === true ||
        isActive === undefined,
    });

    return res.status(201).json({
      success: true,
      message: "Video section created successfully",
      data: videoSection,
    });
  } catch (error) {
    console.error("Create Video Section Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create video section",
      error: error.message,
    });
  }
};


// =========================================================
// GET ACTIVE VIDEO SECTION - USER
// =========================================================
const getVideoSection = async (req, res) => {
  try {
    const videoSection = await VideoSection.findOne({
      isActive: true,
    });

    if (!videoSection) {
      return res.status(404).json({
        success: false,
        message: "Video section not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: videoSection,
    });
  } catch (error) {
    console.error("Get Video Section Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get video section",
      error: error.message,
    });
  }
};


// =========================================================
// GET VIDEO SECTION - ADMIN
// =========================================================
const getAdminVideoSection = async (req, res) => {
  try {
    const videoSection = await VideoSection.findOne();

    if (!videoSection) {
      return res.status(404).json({
        success: false,
        message: "Video section not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: videoSection,
    });
  } catch (error) {
    console.error("Get Admin Video Section Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get video section",
      error: error.message,
    });
  }
};


// =========================================================
// UPDATE VIDEO SECTION - ADMIN
// =========================================================
const updateVideoSection = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      title,
      description,
      videoUrl,
      buttonText,
      buttonLink,
      isActive,
    } = req.body;

    const videoSection = await VideoSection.findById(id);

    if (!videoSection) {
      return res.status(404).json({
        success: false,
        message: "Video section not found",
      });
    }

    // Keep existing video by default
    let finalVideoUrl = videoSection.videoUrl;

    // New uploaded video
    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: "video",
            folder: "ostik/videos",
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        );

        stream.end(req.file.buffer);
      });

      finalVideoUrl = uploadResult.secure_url;
    }

    // New URL
    else if (videoUrl && videoUrl.trim()) {
      finalVideoUrl = videoUrl.trim();
    }

    videoSection.title =
      title?.trim() || videoSection.title;

    videoSection.description =
      description?.trim() || videoSection.description;

    videoSection.videoUrl =
      finalVideoUrl;

    videoSection.buttonText =
      buttonText?.trim() || videoSection.buttonText;

    videoSection.buttonLink =
      buttonLink?.trim() || videoSection.buttonLink;

    if (isActive !== undefined) {
      videoSection.isActive =
        isActive === "true" ||
        isActive === true;
    }

    await videoSection.save();

    return res.status(200).json({
      success: true,
      message: "Video section updated successfully",
      data: videoSection,
    });
  } catch (error) {
    console.error("Update Video Section Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update video section",
      error: error.message,
    });
  }
};


// =========================================================
// DELETE VIDEO SECTION - ADMIN
// =========================================================
const deleteVideoSection = async (req, res) => {
  try {
    const { id } = req.params;

    const videoSection =
      await VideoSection.findByIdAndDelete(id);

    if (!videoSection) {
      return res.status(404).json({
        success: false,
        message: "Video section not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Video section deleted successfully",
    });
  } catch (error) {
    console.error("Delete Video Section Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete video section",
      error: error.message,
    });
  }
};


module.exports = {createVideoSection,getVideoSection,getAdminVideoSection,updateVideoSection,deleteVideoSection,};