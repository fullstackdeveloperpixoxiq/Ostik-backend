const VideoSection = require("../models/VideoSectionSchema");
const cloudinary = require("../Config/Cloudinary");

// Create Video Section
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

    let finalVideoUrl = videoUrl;

    // If video file is uploaded from system
    if (req.file) {
      const uploadResult = await cloudinary.uploader.upload(
        req.file.path,
        {
          resource_type: "video",
          folder: "ostik/videos",
        }
      );

      finalVideoUrl = uploadResult.secure_url;
    }

    // Video URL or uploaded video is required
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
      buttonText,
      buttonLink,
      isActive,
    });

    res.status(201).json({
      success: true,
      message: "Video section created successfully",
      data: videoSection,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create video section",
      error: error.message,
    });
  }
};

// Get Video Section
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

    res.status(200).json({
      success: true,
      data: videoSection,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get video section",
      error: error.message,
    });
  }
};

// Update Video Section
const updateVideoSection = async (req, res) => {
  try {
    const {
      title,
      description,
      videoUrl,
      buttonText,
      buttonLink,
      isActive,
    } = req.body;

    const videoSection = await VideoSection.findOne();

    if (!videoSection) {
      return res.status(404).json({
        success: false,
        message: "Video section not found",
      });
    }

    let finalVideoUrl = videoUrl || videoSection.videoUrl;

    // If a new video file is uploaded
    if (req.file) {
      const uploadResult = await cloudinary.uploader.upload(
        req.file.path,
        {
          resource_type: "video",
          folder: "ostik/videos",
        }
      );

      finalVideoUrl = uploadResult.secure_url;
    }

    videoSection.title = title ?? videoSection.title;
    videoSection.description =
      description ?? videoSection.description;
    videoSection.videoUrl = finalVideoUrl;
    videoSection.buttonText =
      buttonText ?? videoSection.buttonText;
    videoSection.buttonLink =
      buttonLink ?? videoSection.buttonLink;
    videoSection.isActive =
      isActive ?? videoSection.isActive;

    await videoSection.save();

    res.status(200).json({
      success: true,
      message: "Video section updated successfully",
      data: videoSection,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update video section",
      error: error.message,
    });
  }
};

// Delete Video Section
const deleteVideoSection = async (req, res) => {
  try {
    const videoSection = await VideoSection.findOneAndDelete({});

    if (!videoSection) {
      return res.status(404).json({
        success: false,
        message: "Video section not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Video section deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete video section",
      error: error.message,
    });
  }
};

module.exports = {createVideoSection,getVideoSection,updateVideoSection,deleteVideoSection,};

