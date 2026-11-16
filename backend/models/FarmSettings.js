const mongoose = require("mongoose");

// Single document (key "default") holding farm-wide settings:
//  - test-site location for weather: browser coordinates or a typed place
//    (neither set → WeatherAPI auto:ip)
//  - the crop currently being monitored, used for every irrigation decision
const FarmSettingsSchema = new mongoose.Schema({
  key: { type: String, default: "default", unique: true },
  lat: { type: Number, default: null, min: -90, max: 90 },
  lon: { type: Number, default: null, min: -180, max: 180 },
  place: { type: String, default: null, trim: true, maxlength: 100 },
  activeCropKey: { type: String, default: null },
}, { timestamps: true });

FarmSettingsSchema.statics.getSettings = function getSettings() {
  return this.findOne({ key: "default" }).lean();
};

module.exports = mongoose.model("FarmSettings", FarmSettingsSchema);
