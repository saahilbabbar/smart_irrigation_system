const mongoose = require("mongoose");

const CustomCropSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  minMoisture: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  maxMoisture: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  waterRequirement: {
    type: Number,
    required: true,
    min: 0,
  },
  waterRequirementUnit: {
    type: String,
    required: true,
    trim: true,
  },
}, { timestamps: true });

module.exports = mongoose.model("CustomCrop", CustomCropSchema);
