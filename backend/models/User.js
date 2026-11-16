const mongoose = require("mongoose");

// One shared farm with roles:
//  - admin:  everything, including crop/location settings, user management and
//            (later) pump control
//  - viewer: read-only dashboard
const ROLES = ["admin", "viewer"];

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60,
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },

  // bcrypt hash; never returned by queries unless explicitly selected.
  password: {
    type: String,
    required: true,
    select: false,
  },

  role: {
    type: String,
    enum: ROLES,
    default: "viewer",
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

UserSchema.methods.toPublic = function toPublic() {
  return { id: this._id, name: this.name, email: this.email, role: this.role, createdAt: this.createdAt };
};

module.exports = mongoose.model("User", UserSchema);
module.exports.ROLES = ROLES;
