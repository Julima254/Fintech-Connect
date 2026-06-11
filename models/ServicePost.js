const mongoose = require('mongoose');

const servicePostSchema = new mongoose.Schema({
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  socialMedia: {
    facebook:  { type: String, default: '' },
    instagram: { type: String, default: '' },
    twitter:   { type: String, default: '' },
    whatsapp:  { type: String, default: '' }
  },
  image: { type: String, default: null },
  imageCharged: { type: Boolean, default: false },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const serviceSchema = new mongoose.Schema({
  postedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:       { type: String, required: true },
  description: { type: String, required: true },
  category:    { type: String, default: '' },
  price:       { type: Number, default: 0 },
  status:      { type: String, default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('ServicePost', servicePostSchema);