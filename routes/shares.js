const express = require('express');
const router = express.Router();

// @route   GET /shares
// @desc    Render the Shares coming soon page
router.get('/', (req, res) => {
    try {
        res.render('shares');
    } catch (error) {
        console.error("Error rendering shares page:", error);
        res.status(500).send("Server Error");
    }
});

module.exports = router;