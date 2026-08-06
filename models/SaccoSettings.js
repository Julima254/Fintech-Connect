const mongoose = require("mongoose");

const saccoSettingsSchema = new mongoose.Schema({
  registrationFee: {
    type: Number,
    default: 500
  }
}, { timestamps: true });

// Ensures there's always exactly one settings doc
saccoSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model("SaccoSettings", saccoSettingsSchema);