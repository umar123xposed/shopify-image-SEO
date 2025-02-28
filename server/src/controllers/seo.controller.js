const SEOService = require('../services/seo.service');

let seoProcess = null;
let status = {
  isRunning: false,
  totalProducts: 0,
  completedProducts: 0,
  currentProduct: null
};

exports.startSEO = async (req, res) => {
  try {
    const { shopName, shopifyKey, geminiKey, startFresh } = req.body;
    
    if (!shopName || !shopifyKey || !geminiKey) {
      return res.status(400).json({ message: 'Missing required credentials' });
    }
    
    if (status.isRunning) {
      return res.status(400).json({ message: 'SEO process already running' });
    }

    if (startFresh === true) {
      status = {
        isRunning: false,
        totalProducts: 0,
        completedProducts: 0,
        currentProduct: null,
        currentImage: null,
        processedImages: []
      };
    }

    seoProcess = new SEOService(shopName, shopifyKey, geminiKey);
    status.isRunning = true;

    seoProcess.start((progress) => {
      status = { ...status, ...progress };
    }, startFresh === true);

    res.json({ 
      message: startFresh === true ? 'SEO process started fresh' : 'SEO process resumed from checkpoint',
      startFresh: startFresh === true
    });
  } catch (error) {
    console.error('Error starting SEO process:', error);
    res.status(500).json({ message: 'Failed to start SEO process' });
  }
};

exports.getSEOStatus = (req, res) => {
  try {
    res.json(status);
  } catch (error) {
    console.error('Error getting SEO status:', error);
    res.status(500).json({ message: 'Failed to get SEO status' });
  }
};

exports.stopSEO = (req, res) => {
  try {
    if (seoProcess) {
      seoProcess.stop();
      status.isRunning = false;
      res.json({ message: 'SEO process stopped successfully' });
    } else {
      res.status(400).json({ message: 'No SEO process running' });
    }
  } catch (error) {
    console.error('Error stopping SEO process:', error);
    res.status(500).json({ message: 'Failed to stop SEO process' });
  }
}; 