const mongoose = require("mongoose");

// Single document holding the test site: either coordinates from the browser's
// geolocation or a typed place name. When absent, weather uses auto:ip.
const FarmLocationSchema = new mongoose.Schema({
  key: { type: String, default: "default", unique: true },
  lat: { type: Number, default: null, min: -90, max: 90 },
  lon: { type: Number, default: null, min: -180, max: 180 },
  place: { type: String, default: null, trim: true, maxlength: 100 },
}, { timestamps: true });

module.exports = mongoose.model("FarmLocation", FarmLocationSchema);
