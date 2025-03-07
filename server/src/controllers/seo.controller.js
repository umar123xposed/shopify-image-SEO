const SEOService = require('../services/seo.service');
const Progress = require('../models/progress.model');

// Map to store active SEO processes by user ID
const activeProcesses = new Map();

// Define all controller functions
async function startSEO(req, res) {
  try {
    const { startFresh, startFromProductId } = req.body;
    const userId = req.user._id;
    const shopName = req.user.shopName;
    const shopifyKey = req.user.shopifyKey;
    const geminiKey = req.user.geminiKey;

    const seoProcess = new SEOService(userId, shopName, shopifyKey, geminiKey);
    await seoProcess.resetState();
    
    if (activeProcesses.has(userId.toString())) {
      const existingProcess = activeProcesses.get(userId.toString());
      if (existingProcess.isRunning) {
        return res.status(400).json({ message: 'SEO process already running for this user' });
      } else {
        activeProcesses.delete(userId.toString());
      }
    }
    
    activeProcesses.set(userId.toString(), seoProcess);
    seoProcess.start(async () => {}, startFresh === true, startFromProductId);

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
}

async function getSEOStatus(req, res) {
  try {
    const userId = req.user._id;
    const progress = await Progress.findOne({ userId });
    
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
    
    const activeProcess = activeProcesses.get(userId.toString());
    
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
}

async function stopSEO(req, res) {
  try {
    const userId = req.user._id;
    console.log('Stopping SEO process for user:', userId);
    
    // Get active process
    const seoProcess = activeProcesses.get(userId.toString());
    
    if (seoProcess) {
      console.log('Active process found, stopping...');
      await seoProcess.stop();
      activeProcesses.delete(userId.toString());
      
      // Update database to mark as stopped
      await Progress.findOneAndUpdate(
        { userId },
        { 
          isRunning: false,
          updatedAt: new Date()
        },
        { upsert: true }
      );
      
      console.log('SEO process stopped successfully');
      res.json({ success: true, message: 'SEO process stopped successfully' });
    } else {
      console.log('No active process found, checking database...');
      // Check if there's a process marked as running in the database
      const progress = await Progress.findOne({ userId, isRunning: true });
      
      if (progress) {
        console.log('Found running process in database, marking as stopped');
        // Update database to mark as stopped
        await Progress.findOneAndUpdate(
          { userId },
          { 
            isRunning: false,
            updatedAt: new Date()
          },
          { upsert: true }
        );
        
        res.json({ success: true, message: 'SEO process marked as stopped' });
      } else {
        console.log('No running process found');
        res.status(400).json({ success: false, message: 'No SEO process running for this user' });
      }
    }
  } catch (error) {
    console.error('Error stopping SEO process:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to stop SEO process',
      error: error.message 
    });
  }
}

async function getAllProducts(req, res) {
  try {
    // Validate user data
    if (!req.user || !req.user.shopName || !req.user.shopifyKey) {
      console.error('Missing required user data:', {
        hasUser: !!req.user,
        hasShopName: !!req.user?.shopName,
        hasShopifyKey: !!req.user?.shopifyKey
      });
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required user data (shopName or shopifyKey)'
      });
    }

    const { _id: userId, shopName, shopifyKey } = req.user;
    console.log('Fetching products for shop:', shopName);

    // Get progress from database first
    const progress = await Progress.findOne({ userId });
    console.log('Found progress:', {
      hasProgress: !!progress,
      processedCount: progress?.processedProductIds?.length || 0,
      errorCount: progress?.productsWithErrors?.length || 0
    });
    
    // Create SEO service instance
    const seoService = new SEOService(userId, shopName, shopifyKey);
    
    // Get products from Shopify
    const products = await seoService.fetchProducts();
    if (!products || products.length === 0) {
      console.log('No products found or error fetching products');
      return res.json({
        success: true,
        products: [],
        totalProducts: 0,
        completedCount: 0,
        errorCount: 0,
        pendingCount: 0
      });
    }
    
    // Get active process to check current processing status
    const activeProcess = activeProcesses.get(userId.toString());
    
    // Get all completed and error products from database
    const processedProductIds = progress?.processedProductIds || [];
    const productsWithErrors = progress?.productsWithErrors || [];
    const currentProcessingId = activeProcess?.currentProduct?.id;

    console.log('Processing status:', {
      totalProducts: products.length,
      processedCount: processedProductIds.length,
      errorCount: productsWithErrors.length,
      isActiveProcess: !!activeProcess,
      currentProcessingId: currentProcessingId || 'none'
    });

    const productsWithStatus = products.map(product => {
      // Determine the current status of the product
      let status = 'pending';
      if (currentProcessingId && currentProcessingId.toString() === product.id.toString()) {
        status = 'processing';
      } else if (productsWithErrors.includes(product.id)) {
        status = 'error';
      } else if (processedProductIds.includes(product.id)) {
        status = 'completed';
      }

      return {
        id: product.id,
        title: product.title,
        status,
        images: product.images?.length || 0,
        processedAt: progress?.productCompletionTimes?.[product.id] || null,
        hasErrors: productsWithErrors.includes(product.id)
      };
    });

    // Calculate counts
    const completedCount = processedProductIds.length;
    const errorCount = productsWithErrors.length;
    const processingCount = currentProcessingId ? 1 : 0;
    const pendingCount = products.length - (completedCount + errorCount + processingCount);

    console.log('Sending response with counts:', {
      total: products.length,
      completed: completedCount,
      errors: errorCount,
      processing: processingCount,
      pending: pendingCount
    });

    res.json({
      success: true,
      products: productsWithStatus,
      totalProducts: products.length,
      completedCount,
      errorCount,
      pendingCount,
      processingCount,
      isProcessRunning: activeProcess?.isRunning || false
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data
    });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch products. Please check your Shopify credentials and try again.'
    });
  }
}

// Export all controller functions
module.exports = {
  startSEO,
  getSEOStatus,
  stopSEO,
  getAllProducts
}; 