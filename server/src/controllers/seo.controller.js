const SEOService = require('../services/seo.service');
const Progress = require('../models/progress.model');

// Map to store active SEO processes by user ID
const activeProcesses = new Map();

// Define all controller functions
async function startSEO(req, res) {
  try {
    const { startFresh, startFromProductId, seoTypes } = req.body;
    const userId = req.user._id;
    const shopName = req.user.shopName;
    const shopifyKey = req.user.shopifyKey;
    const geminiKey = req.user.geminiKey;

    // Validate seoTypes
    if (!Array.isArray(seoTypes) || seoTypes.length === 0) {
      return res.status(400).json({ message: 'Invalid SEO types provided' });
    }

    console.log('Starting SEO process with types:', seoTypes);

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
    seoProcess.start(async () => {}, startFresh === true, startFromProductId, seoTypes);

    res.json({ 
      message: startFromProductId 
        ? `SEO process starting from product ID ${startFromProductId}`
        : startFresh === true 
          ? 'SEO process started fresh' 
          : 'SEO process resumed from checkpoint',
      startFresh: startFresh === true,
      startFromProductId,
      seoTypes
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
        completedByType: {
          images: 0,
          content: 0
        },
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
      completedByType: progress.completedByType || { images: 0, content: 0 },
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
      processedByType: progress?.processedProductsByType || { images: [], content: [] },
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
        completedByType: { images: 0, content: 0 },
        errorCount: 0,
        pendingCount: 0
      });
    }
    
    // Get active process to check current processing status
    const activeProcess = activeProcesses.get(userId.toString());
    
    // Get all completed and error products from database
    const processedByType = progress?.processedProductsByType || { images: [], content: [] };
    const productsWithErrors = progress?.productsWithErrors || [];
    const currentProcessingId = activeProcess?.currentProduct?.id;
    const currentSeoTypes = activeProcess?.currentProduct?.seoTypes || [];

    // Calculate completion counts
    const completedByType = {
      images: processedByType.images.length,
      content: processedByType.content.length
    };

    const productsWithStatus = products.map(product => {
      // Determine the current status of the product for each SEO type
      const status = {
        images: processedByType.images.includes(product.id) ? 'completed' : 'pending',
        content: processedByType.content.includes(product.id) ? 'completed' : 'pending'
      };

      // If product is currently being processed, update its status
      if (currentProcessingId && currentProcessingId.toString() === product.id.toString()) {
        currentSeoTypes.forEach(type => {
          status[type] = 'processing';
        });
      }

      // If product has errors, mark it
      if (productsWithErrors.includes(product.id)) {
        if (status.images !== 'completed') status.images = 'error';
        if (status.content !== 'completed') status.content = 'error';
      }

      // Get optimization details if available
      const optimizationDetails = progress?.optimizationDetails?.get(product.id) || {};

      return {
        id: product.id,
        title: product.title,
        status,
        images: product.images?.length || 0,
        processedAt: progress?.productCompletionTimes?.[product.id] || null,
        hasErrors: productsWithErrors.includes(product.id),
        optimizationDetails
      };
    });

    // Calculate overall counts
    const completedCount = productsWithStatus.filter(product => 
      product.status.images === 'completed' && product.status.content === 'completed'
    ).length;

    const errorCount = productsWithStatus.filter(product => 
      product.status.images === 'error' || product.status.content === 'error'
    ).length;

    const processingCount = productsWithStatus.filter(product => 
      product.status.images === 'processing' || product.status.content === 'processing'
    ).length;

    const pendingCount = productsWithStatus.filter(product => 
      product.status.images === 'pending' && product.status.content === 'pending'
    ).length;

    console.log('Sending response with counts:', {
      total: products.length,
      completedByType,
      completedCount,
      errors: errorCount,
      processing: processingCount,
      pending: pendingCount
    });

    res.json({
      success: true,
      products: productsWithStatus,
      totalProducts: products.length,
      completedByType,
      completedCount,
      errorCount,
      pendingCount,
      processingCount,
      isProcessRunning: activeProcess?.isRunning || false
    });
  } catch (error) {
    console.error('Error getting all products:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get products',
      message: error.message 
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