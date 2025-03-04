const SEOService = require('../services/seo.service');
const Progress = require('../models/progress.model');

// Map to store active SEO processes by user ID
const activeProcesses = new Map();

exports.startSEO = async (req, res) => {
  try {
    const { startFresh, startFromProductId } = req.body;
    const userId = req.user._id;
    const shopName = req.user.shopName;
    const shopifyKey = req.user.shopifyKey;
    const geminiKey = req.user.geminiKey;

    // Create new SEO service instance
    const seoProcess = new SEOService(userId, shopName, shopifyKey, geminiKey);
    
    // Reset any stale state before checking if process is running
    await seoProcess.resetState();
    
    // Now check if a process is actually running (not just stale state)
    if (activeProcesses.has(userId.toString())) {
      const existingProcess = activeProcesses.get(userId.toString());
      if (existingProcess.isRunning) {
        return res.status(400).json({ message: 'SEO process already running for this user' });
      } else {
        // Clean up stale process
        activeProcesses.delete(userId.toString());
      }
    }
    
    // Store in active processes map
    activeProcesses.set(userId.toString(), seoProcess);
    
    // Start the process
    seoProcess.start(async (progress) => {
      // Progress callback is handled internally by the service now
    }, startFresh === true, startFromProductId);

    res.json({ 
      message: startFromProductId 
        ? `SEO process starting from product ID ${startFromProductId}`
        : startFresh === true 
          ? 'SEO process started fresh' 
          : 'SEO process resumed from checkpoint',
      startFresh: startFresh === true,
      startFromProductId
    });
  } catch (error) {
    console.error('Error starting SEO process:', error);
    res.status(500).json({ message: 'Failed to start SEO process' });
  }
};

exports.getSEOStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get progress from database
    const progress = await Progress.findOne({ userId });
    
    // If no progress found, return default values
    if (!progress) {
      return res.json({
        isRunning: false,
        totalProducts: 0,
        completedProducts: 0,
        currentProduct: null,
        currentImage: null,
        processedImages: []
      });
    }
    
    // Get active process if it exists
    const activeProcess = activeProcesses.get(userId.toString());
    
    // Combine database progress with active process state
    const status = {
      isRunning: activeProcess ? activeProcess.isRunning : progress.isRunning || false,
      totalProducts: progress.totalProducts || 0,
      completedProducts: progress.completedProducts || 0,
      currentProduct: activeProcess ? activeProcess.currentProduct : progress.currentProduct,
      currentImage: activeProcess ? activeProcess.currentImage : progress.currentImage,
      processedImages: activeProcess ? activeProcess.processedImages : (progress.processedImages || [])
    };
    
    res.json(status);
  } catch (error) {
    console.error('Error getting SEO status:', error);
    res.status(500).json({ message: 'Failed to get SEO status' });
  }
};

exports.stopSEO = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get active process
    const seoProcess = activeProcesses.get(userId.toString());
    
    if (seoProcess) {
      await seoProcess.stop();
      activeProcesses.delete(userId.toString());
      
      res.json({ message: 'SEO process stopped successfully' });
    } else {
      // Check if there's a process marked as running in the database
      const progress = await Progress.findOne({ userId, isRunning: true });
      
      if (progress) {
        // Update database to mark as stopped
        await Progress.findOneAndUpdate(
          { userId },
          { isRunning: false },
          { upsert: true }
        );
        
        res.json({ message: 'SEO process marked as stopped' });
      } else {
        res.status(400).json({ message: 'No SEO process running for this user' });
      }
    }
  } catch (error) {
    console.error('Error stopping SEO process:', error);
    res.status(500).json({ message: 'Failed to stop SEO process' });
  }
}; 