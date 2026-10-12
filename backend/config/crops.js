const crops = {
  sugarcane: {
    key: "sugarcane",
    name: "Sugarcane",
    minMoisture: 60,
    maxMoisture: 80,
    waterRequirement: 40,
    waterRequirementUnit: "mm/week",
  },
  wheat: {
    key: "wheat",
    name: "Wheat",
    minMoisture: 40,
    maxMoisture: 60,
    waterRequirement: 20,
    waterRequirementUnit: "mm/week",
  },
  rice: {
    key: "rice",
    name: "Rice",
    minMoisture: 70,
    maxMoisture: 90,
    waterRequirement: 35,
    waterRequirementUnit: "mm/week",
  },
  potato: {
    key: "potato",
    name: "Potato",
    minMoisture: 60,
    maxMoisture: 80,
    waterRequirement: 30,
    waterRequirementUnit: "mm/week",
  },
  onion: {
    key: "onion",
    name: "Onion",
    minMoisture: 50,
    maxMoisture: 70,
    waterRequirement: 20,
    waterRequirementUnit: "mm/week",
  },
};

const DEFAULT_CROP_KEY = "sugarcane";

const getCrop = (key) => crops[key] || crops[DEFAULT_CROP_KEY];

const getCropByKey = async (key) => {
  if (crops[key]) return crops[key];

  const CustomCrop = require("../models/CustomCrop");
  const customCrop = await CustomCrop.findOne({ key }).lean();

  return customCrop || crops[DEFAULT_CROP_KEY];
};

module.exports = { crops, DEFAULT_CROP_KEY, getCrop, getCropByKey };
