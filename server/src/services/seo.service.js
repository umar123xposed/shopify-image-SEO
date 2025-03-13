const axios = require('axios');
const FormData = require('form-data');
const { Readable } = require('stream');
const Progress = require('../models/progress.model');

class SEOService {
  constructor(userId, shopName, shopifyKey, geminiKey) {
    this.userId = userId;
    this.shopName = shopName;
    this.shopifyKey = shopifyKey;
    this.geminiKey = geminiKey;
    
    this.isRunning = false;
    this.totalProducts = 0;
    this.completedProducts = 0;
    this.currentProduct = null; // Will store {id, title, images}
    this.currentImage = null;
    this.processedImages = [];
    this.maxProcessedImages = 8; // Reduced from 20 to 8 for better dashboard performance
    this.onProgress = null;
    this.processedProductIds = new Set(); // Track processed product IDs
    
    // Add error tracking
    this.apiErrorCount = 0;
    this.maxApiErrors = 3; // Stop after 3 consecutive API errors
    this.lastError = null;
    this.productsWithErrors = new Set();

    this.processedProductsByType = {
      images: [],
      content: []
    };

    // Initialize Gemini client
    this.geminiClient = {
      generateContent: async ({ contents }) => {
        try {
          const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.geminiKey}`,
            { contents },
            { headers: { "Content-Type": "application/json" } }
          );
          return response.data;
        } catch (error) {
          console.error('Gemini API Error:', error.message);
          throw error;
        }
      }
    };

    this.currentProductFilenames = new Set(); // Track filenames for current product
  }

  // Load progress from database
  async loadProgress() {
    try {
      let progress = await Progress.findOne({ userId: this.userId });
      if (!progress) {
        progress = new Progress({
          userId: this.userId,
          shopName: this.shopName,
          lastProductId: null,
          completedProducts: 0,
          totalProducts: 0,
          isRunning: false,
          processedProductsByType: {
            images: [],
            content: []
          },
          completedByType: {
            images: 0,
            content: 0
          }
        });
        await progress.save();
      }
      return {
        lastProductId: progress.lastProductId,
        completedProducts: progress.completedProducts || 0,
        totalProducts: progress.totalProducts || 0,
        isRunning: progress.isRunning || false,
        processedProductsByType: progress.processedProductsByType || { images: [], content: [] },
        completedByType: progress.completedByType || { images: 0, content: 0 },
        currentProductId: progress.currentProductId,
        currentProductTitle: progress.currentProductTitle,
        currentImage: progress.currentImage
      };
    } catch (error) {
      console.error("Error loading progress:", error);
      return { 
        lastProductId: null,
        completedProducts: 0,
        totalProducts: 0,
        isRunning: false,
        processedProductsByType: { images: [], content: [] },
        completedByType: { images: 0, content: 0 },
        currentProductId: null,
        currentProductTitle: null,
        currentImage: null
      };
    }
  }

  // Save progress to database
  async saveProgress(productId) {
    try {
      // Calculate completedByType counts from current state
      const completedByType = {
        images: Array.isArray(this.processedProductsByType.images) ? this.processedProductsByType.images.length : 0,
        content: Array.isArray(this.processedProductsByType.content) ? this.processedProductsByType.content.length : 0
      };

      // Extract only the necessary string fields from currentProduct
      const currentProductInfo = this.currentProduct ? {
        id: this.currentProduct.id.toString(),
        title: this.currentProduct.title,
        seoTypes: this.currentProduct.seoTypes
      } : null;

      // Ensure we only keep the most recent images, sorted by processedAt date
      const sortedImages = [...this.processedImages]
        .sort((a, b) => new Date(b.processedAt || 0) - new Date(a.processedAt || 0))
        .slice(0, this.maxProcessedImages);

      const updateData = {
        lastProductId: productId,
        completedProducts: this.completedProducts,
        totalProducts: this.totalProducts,
        isRunning: this.isRunning,
        currentProductId: currentProductInfo?.id || null,
        currentProductTitle: currentProductInfo?.title || null,
        currentProductSeoTypes: currentProductInfo?.seoTypes || [],
        processedImages: sortedImages,
        processedProductIds: Array.from(this.processedProductIds),
        processedProductsByType: {
          images: Array.from(new Set(this.processedProductsByType.images)),
          content: Array.from(new Set(this.processedProductsByType.content))
        },
        completedByType,
        updatedAt: new Date()
      };

      // Update progress in database
      const updatedProgress = await Progress.findOneAndUpdate(
        { userId: this.userId },
        updateData,
        { upsert: true, new: true }
      );

      // Log progress update for debugging
      console.log('Progress saved:', {
        completedByType,
        totalProducts: this.totalProducts,
        completedProducts: this.completedProducts,
        processedImages: this.processedProductsByType.images.length,
        processedContent: this.processedProductsByType.content.length
      });

      // Call progress callback if provided
      if (this.onProgress) {
        this.onProgress({
          completedProducts: this.completedProducts,
          totalProducts: this.totalProducts,
          processedProductsByType: this.processedProductsByType,
          completedByType
        });
      }

      return updatedProgress;
    } catch (error) {
      console.error("Error saving progress:", error);
      throw error;
    }
  }

  // Fetch all products from Shopify
  async fetchProducts() {
    if (!this.shopName || !this.shopifyKey) {
      console.error('Missing required credentials:', {
        hasShopName: !!this.shopName,
        hasShopifyKey: !!this.shopifyKey
      });
      throw new Error('Missing Shopify credentials');
    }

    let allProducts = [];
    let nextPageUrl = `https://${this.shopName}.myshopify.com/admin/api/2024-01/products.json?limit=50`;

    try {
      console.log('Starting to fetch products from Shopify...');
      
      while (nextPageUrl) {
        console.log('Fetching page:', nextPageUrl);
        
        const response = await axios.get(nextPageUrl, {
          headers: { 
            "X-Shopify-Access-Token": this.shopifyKey,
            "Content-Type": "application/json"
          },
        });

        if (!response.data || !response.data.products) {
          console.error('Invalid response from Shopify:', response.data);
          throw new Error('Invalid response from Shopify API');
        }

        allProducts = [...allProducts, ...response.data.products];
        console.log(`Fetched ${response.data.products.length} products from current page`);

        // Check for pagination
        const linkHeader = response.headers["link"];
        if (linkHeader) {
          const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          nextPageUrl = match ? match[1] : null;
          if (nextPageUrl) {
            console.log('Next page found, continuing...');
          }
        } else {
          nextPageUrl = null;
        }
      }

      console.log(`✅ Successfully fetched ${allProducts.length} products from Shopify.`);
      return allProducts;
    } catch (error) {
      console.error("❌ Error fetching products:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // Check for specific error types
      if (error.response?.status === 401) {
        throw new Error('Invalid Shopify credentials. Please check your API key.');
      } else if (error.response?.status === 404) {
        throw new Error('Shop not found. Please check your shop name.');
      } else if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      
      throw new Error(`Failed to fetch products: ${error.message}`);
    }
  }

  // Download image as buffer instead of base64
  async downloadImage(imageUrl) {
    try {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      return response.data;
    } catch (error) {
      console.error("❌ Error downloading image:", error.message);
      return null;
    }
  }

  // Convert buffer to stream
  bufferToStream(buffer) {
    return Readable.from(buffer);
  }

  // Get image description from Gemini AI
  async getImageDescription(base64Image, productTitle, productDescription, usedFilenames = []) {
    try {
      const filenamesContext = usedFilenames.length > 0 
        ? `Previously used filenames for this product:
           ${usedFilenames.join(', ')}
           Please generate a DIFFERENT filename that has not been used before.`
        : '';

      const prompt = `
You are an expert in e-commerce SEO and product listing optimization.
Your task is to analyze the given image with respect to its already uploaded product title and its description which is uploaded on shopify and generate:
  1️⃣ AltText: A highly descriptive, SEO-friendly alt text (125 characters max).
  2️⃣ Filename: A short, keyword-rich filename (no spaces, no special characters, no file extension).

${filenamesContext}

### **Guidelines for Alt Text**:
✅ Clearly describe the main subject of the image with respect to its product title and product description 
✅ Include relevant attributes such as **color, material, size, usage, and unique features**.  
✅ Use a natural, human-readable sentence structure.  
✅ Keep it **concise** and **highly relevant** to e-commerce SEO.  
✅ **DO NOT** start with "Image of" or "Picture of".  
✅ **DO NOT** use generic terms like "Product", "Item", or "Photo".  
✅ **DO NOT** add excessive words; focus on what truly matters.

### **Guidelines for Filename**:
✅ Create a **short and keyword-optimized filename**
✅ Use **hyphens (-) instead of spaces**
✅ Focus on **high-ranking search terms** related to the product
✅ Make the filename UNIQUE - do not use any of the previously used filenames
✅ Add distinguishing features if needed (color, pattern, angle, etc.)
✅ **DO NOT** use unnecessary words like "photo", "image", or "screenshot"
✅ **DO NOT** include the file extension (.jpg, .png, etc.)
✅ **DO NOT** use special characters, only letters, numbers, and hyphens

### **Example Outputs**:
📌 **Example 1 (Red Sneakers)**  
- Alt Text: "Stylish red canvas sneakers with white laces, rubber sole, and breathable fabric."  
- Filename: "red-canvas-sneakers-white-laces"

📌 **Example 2 (Handbag)**  
- Alt Text: "Elegant black leather handbag with gold chain strap, quilted design, and compact size."  
- Filename: "black-leather-handbag-gold-strap"

📌 **Example 3 (Plush Toy)**  
- Alt Text: "Adorable red panda plush toy with soft fur, lifelike facial details, and fluffy tail."  
- Filename: "red-panda-plush-soft-toy"

🔍 **Now analyze the following image carefully and generate the best possible SEO-optimized alt text and filename.**  
** your reponse should only be in this format(nothing more nothing less):
AltText: <description>
Filename: <name> (WITHOUT .jpg extension)**
`;

      const response = await this.geminiClient.generateContent({
          contents: [
            {
              parts: [
                { text: prompt },
                { text: productTitle },
                { text: productDescription },
                { inline_data: { mime_type: "image/jpeg", data: base64Image } },
              ],
            },
          ],
      });

      const textResponse = response.candidates[0].content.parts[0].text;
      console.log(`🧠 Raw AI Response:\n${textResponse}`);

      const match = textResponse.match(/AltText:\s*(.*?)\s*\nFilename:\s*(.*)/i);
      if (!match) {
        console.warn(`⚠️ Unexpected AI response format: ${textResponse}`);
        return { error: 'Invalid AI response format' };
      }

      let altText = match[1].trim();
      let fileName = match[2].trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();

      return { success: true, altText, fileName };
    } catch (error) {
      console.error("❌ Error fetching AI-generated alt text and filename:", error.message);
      return { error: error.message };
    }
  }

  async getAIGeneratedContent(image, product) {
    try {
      const imageBuffer = await this.downloadImage(image.src);
      if (!imageBuffer) {
        return { error: 'Failed to download image' };
      }

      const base64Image = Buffer.from(imageBuffer).toString('base64');
      const result = await this.getImageDescription(base64Image, product.title, product.body_html, Array.from(this.currentProductFilenames));
      
      if (result.error) {
        // Check for API errors
        if (result.error.includes('429') || result.error.includes('401')) {
          this.apiErrorCount++;
          console.log(`API Error count: ${this.apiErrorCount}/${this.maxApiErrors}`);

          if (this.apiErrorCount >= this.maxApiErrors) {
            await this.forceStop('Process stopped: Multiple API errors occurred. Please check your API key and restart the process.');
            return { 
              success: false, 
              error: 'API key error - process stopped', 
              apiKeyError: true 
            };
          }
        }
        this.productsWithErrors.add(product.id);
        await Progress.findOneAndUpdate(
          { userId: this.userId },
          { 
            $addToSet: { productsWithErrors: product.id }
          }
        );
        return { success: false, error: result.error };
      }

      // Reset error count since AI request succeeded
      this.apiErrorCount = 0;

      return {
        success: true,
        altText: result.altText,
        fileName: result.fileName
      };
    } catch (error) {
      console.error('Process Image Error:', error);
      this.productsWithErrors.add(product.id);
      await Progress.findOneAndUpdate(
        { userId: this.userId },
        { 
          $addToSet: { productsWithErrors: product.id }
        }
      );
      throw error;
    }
  }

  async updateShopifyImage(productId, imageId, updates) {
    try {
      const url = `https://${this.shopName}.myshopify.com/admin/api/2024-01/products/${productId}/images/${imageId}.json`;
      
      const response = await axios.put(
        url,
        { image: updates },
        {
          headers: {
            "X-Shopify-Access-Token": this.shopifyKey,
            "Content-Type": "application/json"
          }
        }
      );

      if (!response.data || !response.data.image) {
        throw new Error('Invalid response from Shopify API');
      }

      return {
        success: true,
        newImageId: response.data.image.id
      };
    } catch (error) {
      console.error("Error updating Shopify image:", error.message);
      throw error;
    }
  }

  async uploadNewShopifyImage(productId, image, altText, filename) {
    try {
      // Instead of re-encoding the image, use the original source URL
      const url = `https://${this.shopName}.myshopify.com/admin/api/2024-01/products/${productId}/images.json`;
      
      const response = await axios.post(
        url,
        { 
          image: {
            src: image.src, // Use original image URL instead of base64
            alt: altText,
            filename: `${filename}.jpg`
          }
        },
        {
          headers: {
            "X-Shopify-Access-Token": this.shopifyKey,
            "Content-Type": "application/json"
          }
        }
      );

      if (!response.data || !response.data.image) {
        throw new Error('Invalid response from Shopify API when uploading new image');
      }

      return {
        success: true,
        newImageId: response.data.image.id,
        newImageSrc: response.data.image.src
      };
    } catch (error) {
      console.error("Error uploading new Shopify image:", error.message);
      throw error;
    }
  }

  async getProductVariants(productId) {
    try {
      const url = `https://${this.shopName}.myshopify.com/admin/api/2024-01/products/${productId}.json`;
      
      const response = await axios.get(
        url,
        {
          headers: {
            "X-Shopify-Access-Token": this.shopifyKey,
            "Content-Type": "application/json"
          }
        }
      );

      if (!response.data || !response.data.product) {
        throw new Error('Invalid response from Shopify API when fetching product details');
      }

      // Ensure we always return an array for variants
      const variants = response.data.product.variants || [];
      const product = response.data.product;

      return {
        product,
        variants: Array.isArray(variants) ? variants : []
      };
    } catch (error) {
      console.error("Error fetching product details:", error.message);
      return {
        product: null,
        variants: []
      };
    }
  }

  async updateVariantImage(productId, variantId, imageId) {
    try {
      const url = `https://${this.shopName}.myshopify.com/admin/api/2024-01/products/${productId}/variants/${variantId}.json`;
      
      const response = await axios.put(
        url,
        { 
          variant: {
            id: variantId,
            image_id: imageId
          }
        },
        {
          headers: {
            "X-Shopify-Access-Token": this.shopifyKey,
            "Content-Type": "application/json"
          }
        }
      );

      if (!response.data || !response.data.variant) {
        throw new Error('Invalid response from Shopify API when updating variant');
      }

      return {
        success: true,
        variantId: response.data.variant.id
      };
    } catch (error) {
      console.error(`Error updating variant ${variantId} image:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteShopifyImage(productId, imageId) {
    try {
      const url = `https://${this.shopName}.myshopify.com/admin/api/2024-01/products/${productId}/images/${imageId}.json`;
      
      await axios.delete(
        url,
              {
                headers: {
                  "X-Shopify-Access-Token": this.shopifyKey,
            "Content-Type": "application/json"
          }
        }
      );

      return {
        success: true
      };
    } catch (error) {
      console.error("Error deleting Shopify image:", error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async processImage(image, product, usedFilenames = []) {
    try {
      if (!this.isRunning) {
        return { success: false, error: 'Process stopped' };
      }

      // Check if this image has already been processed
      const existingProcessed = this.processedImages.find(
        p => p.oldImageId === image.id && p.productId === product.id
      );
      if (existingProcessed) {
        console.log(`Image ${image.id} for product ${product.id} has already been processed, skipping...`);
        return { success: true, alreadyProcessed: true };
      }

      // Download the image for AI processing only
      console.log(`Downloading image ${image.id} for product ${product.id}...`);
      const imageBuffer = await this.downloadImage(image.src);
      if (!imageBuffer) {
        return { success: false, error: 'Failed to download image' };
      }

      // Get AI-generated content
      const result = await this.getAIGeneratedContent(image, product, usedFilenames);
      
      if (result.error) {
        // Handle error cases...
        return { success: false, error: result.error };
      }

      // Reset error count since AI request succeeded
      this.apiErrorCount = 0;

      try {
        // First, delete any existing duplicate images
        const productDetails = await this.getProductVariants(product.id);
        const existingImages = productDetails.product?.images || [];
        const duplicates = existingImages.filter(img => 
          img.id !== image.id && 
          (img.src === image.src || img.alt === result.altText)
        );

        for (const duplicate of duplicates) {
          console.log(`Deleting duplicate image ${duplicate.id} for product ${product.id}...`);
          const deleteResult = await this.deleteShopifyImage(product.id, duplicate.id);
          if (!deleteResult.success) {
            console.warn(`Failed to delete duplicate image ${duplicate.id}: ${deleteResult.error}`);
          }
        }

        // Upload the new image
        console.log(`Uploading new image for product ${product.id} with new alt text and filename...`);
        const uploadResult = await this.uploadNewShopifyImage(
          product.id, 
          image,
          result.altText, 
          result.fileName
        );

        if (!uploadResult.success) {
          throw new Error('Failed to upload new image');
        }

        // Update current image with new information
        this.currentImage = {
          ...this.currentImage,
          newImageId: uploadResult.newImageId,
          newImageSrc: uploadResult.newImageSrc,
          newAltText: result.altText,
          newFilename: result.fileName,
          status: 'completed'
        };

        // Get all variants for this product
        console.log(`Fetching variants for product ${product.id}...`);
        const variantDetails = await this.getProductVariants(product.id);
        
        // Find variants using the old image
        const variantsUsingOldImage = variantDetails.variants.filter(variant => 
          variant.image_id === parseInt(image.id)
        );
        
        // Update variants to use the new image
        if (variantsUsingOldImage.length > 0) {
          console.log(`Updating ${variantsUsingOldImage.length} variants to use new image...`);
          for (const variant of variantsUsingOldImage) {
            await this.updateVariantImage(product.id, variant.id, uploadResult.newImageId);
          }
        }
        
        // Delete the old image only after variants are updated and only if it still exists
        console.log(`Deleting old image ${image.id} for product ${product.id}...`);
        const oldImageExists = (await this.getProductVariants(product.id))
          .product?.images?.some(img => img.id === parseInt(image.id));
        
        if (oldImageExists) {
          const deleteResult = await this.deleteShopifyImage(product.id, image.id);
          if (!deleteResult.success) {
            console.error(`Failed to delete old image: ${deleteResult.error}`);
          }
        } else {
          console.log(`Old image ${image.id} no longer exists, skipping deletion`);
        }

        // Add to processed images to prevent reprocessing
        const processedImage = {
          id: uploadResult.newImageId,
          src: uploadResult.newImageSrc,
          productId: product.id,
          productTitle: product.title,
          status: 'completed',
          newAltText: result.altText,
          newFilename: result.fileName,
          oldImageId: image.id,
          processedAt: new Date()
        };
        this.addToProcessedImages(processedImage);

        return {
          success: true,
          newAltText: result.altText,
          newFilename: result.fileName,
          oldImageId: image.id,
          newImageId: uploadResult.newImageId,
          newImageSrc: uploadResult.newImageSrc,
          variantsUpdated: variantsUsingOldImage.length
        };
      } catch (updateError) {
        console.error('Error updating Shopify:', updateError);
        return {
          success: false,
          error: `Failed to update Shopify: ${updateError.message}`
        };
      }
    } catch (error) {
      console.error('Process Image Error:', error);
      this.productsWithErrors.add(product.id);
      await Progress.findOneAndUpdate(
        { userId: this.userId },
        { 
          $addToSet: { productsWithErrors: product.id }
        }
      );
      throw error;
    }
  }

  async forceStop(errorMessage) {
    console.log('Force stopping SEO process...');
    this.isRunning = false;
    this.apiErrorCount = 0;
    
    try {
      await Progress.findOneAndUpdate(
        { userId: this.userId },
        { 
          isRunning: false,
          currentProductId: this.currentProduct?.id || null,
          currentProductTitle: this.currentProduct?.title || null, // Only store the title string
          lastProductId: this.lastProcessedProductId,
          completedProducts: this.completedProducts,
          currentImage: this.currentImage,
          error: errorMessage,
          lastError: errorMessage,
          apiErrorCount: 0,
          updatedAt: new Date()
        },
        { upsert: true }
      );
      console.log('Database updated with stopped state');
    } catch (error) {
      console.error("Error updating stop status in database:", error);
    }
    
    this.updateProgress();
  }

  async stop() {
    console.log('Stopping SEO process by user request...');
    await this.forceStop('Process stopped by user');
    console.log('SEO process stopped successfully');
  }

  // Add a new method to reset the running state
  async resetState() {
    this.isRunning = false;
    this.apiErrorCount = 0;
    this.lastError = null;
    
    try {
      await Progress.findOneAndUpdate(
        { userId: this.userId },
        { 
          isRunning: false,
          error: null,
          lastError: null,
          apiErrorCount: 0
        },
        { upsert: true }
      );
    } catch (error) {
      console.error("Error resetting state:", error);
    }
  }

  async start(progressCallback, startFresh = false, startFromProductId = null, seoTypes = ['images', 'content']) {
    try {
      // Reset state if starting fresh
      if (startFresh) {
        this.processedProductIds.clear();
        this.processedImages = [];
        this.completedProducts = 0;
        this.processedProductsByType = {
          images: [],
          content: []
        };
        
        // Clear progress in database when starting fresh
        await Progress.findOneAndUpdate(
          { userId: this.userId },
          {
            $set: {
              processedProductIds: [],
              processedImages: [],
              completedProducts: 0,
              processedProductsByType: { images: [], content: [] },
              completedByType: { images: 0, content: 0 },
              isRunning: true,
              startedAt: new Date()
            }
          },
          { upsert: true }
        );
      }

      // Get existing progress from database
      const existingProgress = await Progress.findOne({ userId: this.userId });
      
      if (!startFresh && existingProgress) {
        // Restore processed products state
        this.processedProductsByType = {
          images: Array.isArray(existingProgress.processedProductsByType?.images) 
            ? existingProgress.processedProductsByType.images 
            : [],
          content: Array.isArray(existingProgress.processedProductsByType?.content) 
            ? existingProgress.processedProductsByType.content 
            : []
        };
        
        if (existingProgress.processedProductIds) {
          this.processedProductIds = new Set(existingProgress.processedProductIds);
        }
        
        this.completedProducts = existingProgress.completedProducts || 0;
        
        console.log('Restored progress state:', {
          processedImages: this.processedProductsByType.images.length,
          processedContent: this.processedProductsByType.content.length,
          completedProducts: this.completedProducts
        });
      }

      // Fetch all products
      const products = await this.fetchProducts();
      if (!products || products.length === 0) {
        throw new Error('No products found');
      }

      this.totalProducts = products.length;
      this.isRunning = true;
      this.onProgress = progressCallback;

      let startIndex = 0;

      if (startFromProductId) {
        // Find the index of the specified product ID
        startIndex = products.findIndex((p) => p.id.toString() === startFromProductId.toString());
        if (startIndex === -1) {
          console.warn(`⚠️ Product ID ${startFromProductId} not found, starting from beginning`);
          startIndex = 0;
        } else {
          console.log(`🎯 Starting from product ID ${startFromProductId} at index ${startIndex}`);
          // Update completed products count to include previously completed products
          this.completedProducts = this.processedProductIds.size;
        }
      } else if (!startFresh) {
        const progress = await this.loadProgress();
        // Keep the higher count between loaded progress and processed IDs set
        this.completedProducts = Math.max(progress.completedProducts || 0, this.processedProductIds.size);
        
        // Find the current product being processed when stopped
        if (progress.currentProductTitle) {
          startIndex = products.findIndex((p) => p.title === progress.currentProductTitle);
          if (startIndex === -1) {
            if (progress.lastProductId) {
              startIndex = products.findIndex((p) => p.id === progress.lastProductId);
              startIndex = startIndex !== -1 ? startIndex + 1 : 0;
            } else {
              startIndex = 0;
            }
          }
          console.log(`⏳ Resuming from product: ${progress.currentProductTitle} (index: ${startIndex})`);
        } else if (progress.lastProductId) {
          startIndex = products.findIndex((p) => p.id === progress.lastProductId);
          startIndex = startIndex !== -1 ? startIndex + 1 : 0;
          console.log(`⏳ Resuming after last completed product (index: ${startIndex})`);
        }
      }

      // Only process products from startIndex onwards
      const remainingProducts = products.slice(startIndex);
      console.log(`📦 Remaining products to process: ${remainingProducts.length}`);
      
      // Update progress in database with current state
      await Progress.findOneAndUpdate(
        { userId: this.userId },
        { 
          totalProducts: this.totalProducts,
          completedProducts: this.completedProducts,
          isRunning: true,
          processedProductIds: Array.from(this.processedProductIds), // Ensure we preserve existing completed products
          processedProductsByType: existingProgress.processedProductsByType || { images: [], content: [] },
          completedByType: existingProgress.completedByType || { images: 0, content: 0 }
        },
        { upsert: true }
      );

        this.updateProgress();

      // Process remaining products with explicit seoTypes
      for (const product of remainingProducts) {
        if (!this.isRunning) break;
        
        if (!product.images || product.images.length === 0) {
          // Mark products without images as processed to avoid confusion
          this.processedProductIds.add(product.id);
          continue;
        }
        
        // Pass the seoTypes explicitly
        await this.processProduct(product, seoTypes);
        
        // Update progress after each product with current state
        await Progress.findOneAndUpdate(
          { userId: this.userId },
          { 
            completedProducts: this.completedProducts,
            processedProductIds: Array.from(this.processedProductIds),
            processedProductsByType: this.processedProductsByType,
            completedByType: {
              images: this.processedProductsByType.images.length,
              content: this.processedProductsByType.content.length
            },
            currentProductId: product.id,
            currentProductTitle: product.title,
            seoTypes: seoTypes,
            totalProducts: this.totalProducts
          },
          { new: true }
        );

        // Call progress callback if provided
        if (this.onProgress) {
          this.onProgress({
            completedProducts: this.completedProducts,
            totalProducts: this.totalProducts,
            processedProductsByType: this.processedProductsByType,
            completedByType: {
              images: this.processedProductsByType.images.length,
              content: this.processedProductsByType.content.length
            }
          });
        }
      }
    } catch (error) {
      console.error("❌ Error in SEO process:", error);
      await this.forceStop(error.message);
    } finally {
      // Ensure we always update the final state
      if (this.isRunning) {
        await this.forceStop('Process completed');
      }
    }
  }

  async processProduct(product, seoTypes = ['images', 'content']) {
    try {
      console.log(`🔄 Processing product: ${product.title} (ID: ${product.id})`);
      console.log(`SEO types to process: ${seoTypes.join(', ')}`);
      
      this.currentProduct = {
        id: product.id,
        title: product.title,
        seoTypes
      };

      let contentOptimized = false;
      let imagesOptimized = false;

      // Process content SEO if selected
      if (seoTypes.includes('content')) {
        try {
          console.log(`Starting content optimization for product ${product.id}`);
          await this.optimizeProductContent(product);
          if (!this.processedProductsByType.content.includes(product.id)) {
            this.processedProductsByType.content.push(product.id);
            contentOptimized = true;
            console.log(`✅ Content optimization completed for product ${product.id}`);
          }
        } catch (error) {
          console.error(`Error optimizing content for product ${product.title}:`, error);
          throw error;
        }
      }

      // Process image SEO if selected
      if (seoTypes.includes('images')) {
        try {
          console.log(`Starting image optimization for product ${product.id}`);
          await this.optimizeProductImages(product);
          if (!this.processedProductsByType.images.includes(product.id)) {
            this.processedProductsByType.images.push(product.id);
            imagesOptimized = true;
            console.log(`✅ Image optimization completed for product ${product.id}`);
          }
        } catch (error) {
          console.error(`Error optimizing images for product ${product.title}:`, error);
          throw error;
        }
      }

      // Add to processed products set if all selected types were processed
      const allSelectedTypesProcessed = 
        (!seoTypes.includes('content') || contentOptimized) && 
        (!seoTypes.includes('images') || imagesOptimized);

      if (allSelectedTypesProcessed) {
        if (!this.processedProductIds.has(product.id)) {
          this.processedProductIds.add(product.id);
          this.completedProducts++;
        }
        
        console.log(`✅ All selected SEO types processed for product ${product.id}`);
        console.log('Current progress:', {
          completedProducts: this.completedProducts,
          totalProducts: this.totalProducts,
          processedImages: this.processedProductsByType.images.length,
          processedContent: this.processedProductsByType.content.length
        });

        // Save progress immediately after completing all types
        await this.saveProgress(product.id);
      }

      return true;
    } catch (error) {
      console.error(`Failed to process product ${product.title}:`, error);
      throw error;
    }
  }

  addToProcessedImages(image) {
    // Ensure we're only storing necessary image data and using the new image source
    const processedImage = {
      id: image.newImageId || image.id, // Use new image ID if available
      src: image.newImageSrc || image.src, // Use new image source if available
      productId: image.productId,
      productTitle: image.productTitle,
      status: image.status,
      error: image.error,
      newAltText: image.newAltText,
      newFilename: image.newFilename,
      oldImageId: image.oldImageId,
      newImageId: image.newImageId,
      processedAt: new Date()
    };

    // Add the new image to the beginning of the array
    this.processedImages.unshift(processedImage);
    
    // Keep only the most recent images up to the maximum limit
    if (this.processedImages.length > this.maxProcessedImages) {
      this.processedImages = this.processedImages.slice(0, this.maxProcessedImages);
    }
    
    // Update progress in database
    this.updateProgress();
  }

  async updateProgress(update) {
    try {
      const progress = await Progress.findOneAndUpdate(
        { userId: this.userId, shopName: this.shopName },
        {
          $set: {
            ...update,
            lastError: this.lastError ? this.lastError.message : null,
            apiErrorCount: this.apiErrorCount
          }
        },
        { new: true, upsert: true }
      );
      return progress;
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  }

  // Get title and description optimization from Gemini AI
  async getTitleDescriptionOptimization(title, description, base64Image) {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds delay between retries
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempt ${attempt}/${maxRetries} to optimize content...`);

        const prompt = `Optimize the following product title and description for SEO and readability. Make it engaging and informative while maintaining accuracy:

Title: ${title}

Current Description:
${description}

Please provide:
1. An optimized title (max 60 characters)
2. An optimized description in HTML format for shopify description, that is well-structured with sections like Key Features, Specifications, etc.

IMPORTANT: Format your response EXACTLY as follows:
Optimized Title: [Your optimized title here]
Optimized Description:
[Your optimized description here in HTML format]`;

        console.log('Sending prompt to Gemini API...');
        const response = await this.geminiClient.generateContent({
          contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: base64Image } }] }]
        });

        // Validate API response
        if (!response?.candidates?.[0]?.content?.parts?.[0]?.text) {
          throw new Error('Invalid or empty response from Gemini API');
        }

        const aiResponse = response.candidates[0].content.parts[0].text;
        console.log('Raw AI Response received, length:', aiResponse.length);

        // Extract title and description using more robust regex patterns
        const titleMatch = aiResponse.match(/Optimized Title:\s*(.+?)(?=\n|$)/i);
        const descriptionMatch = aiResponse.match(/Optimized Description:(?:\s*(?:in HTML:?)?)([\s\S]+)$/i);

        console.log('Title match:', titleMatch ? titleMatch[1] : 'No match');
        console.log('Description match found:', !!descriptionMatch);

        if (!titleMatch || !descriptionMatch) {
          throw new Error('Could not parse AI response format');
        }

        let optimizedTitle = titleMatch[1].trim();
        let optimizedDescription = descriptionMatch[1].trim();

        // Clean up the description
        optimizedDescription = optimizedDescription
          .replace(/\```html|\```/g, '') // Remove HTML code block markers
          .replace(/&amp;/g, '&') // Replace HTML entities
          .replace(/^\s+|\s+$/g, '') // Trim whitespace
          .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newlines
          .replace(/```/g, '') // Remove any remaining code block markers
          .trim();

        // Validate the extracted content
        if (!optimizedTitle || optimizedTitle.length > 60) {
          throw new Error(`Invalid title length (${optimizedTitle.length} chars) or format`);
        }

        if (!optimizedDescription || optimizedDescription.length < 50) {
          throw new Error(`Invalid description length (${optimizedDescription.length} chars) or format`);
        }

        console.log('Successfully extracted content:', {
          titleLength: optimizedTitle.length,
          descriptionLength: optimizedDescription.length
        });

        // If we get here, the content is valid, so return it
        return {
          title: optimizedTitle,
          description: optimizedDescription
        };

      } catch (error) {
        lastError = error;
        console.error(`Attempt ${attempt}/${maxRetries} failed:`, error.message);
        
        if (attempt < maxRetries) {
          console.log(`Waiting ${retryDelay/1000} seconds before retry...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    // If we get here, all retries failed
    console.error('All optimization attempts failed:', lastError);
    return {
      error: `Failed after ${maxRetries} attempts: ${lastError.message}`
    };
  }

  // Add method to update product details in Shopify
  async updateProductDetails(productId, title, description) {
    const maxRetries = 3;
    const retryDelay = 2000;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempt ${attempt}/${maxRetries} to update product details...`);
        
        const url = `https://${this.shopName}.myshopify.com/admin/api/2024-01/products/${productId}.json`;
        
        const response = await axios.put(
          url,
          {
            product: {
              id: productId,
              title: title,
              body_html: description
            }
          },
          {
            headers: {
              "X-Shopify-Access-Token": this.shopifyKey,
              "Content-Type": "application/json"
            }
          }
        );

        if (!response.data || !response.data.product) {
          throw new Error('Invalid response from Shopify API when updating product details');
        }

        console.log(`✅ Successfully updated product ${productId} details on attempt ${attempt}`);
        return {
          success: true,
          updatedProduct: response.data.product
        };

      } catch (error) {
        lastError = error;
        console.error(`Attempt ${attempt}/${maxRetries} failed:`, error.message);
        
        if (attempt < maxRetries) {
          console.log(`Waiting ${retryDelay/1000} seconds before retry...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    console.error(`Failed to update product ${productId} details after ${maxRetries} attempts:`, lastError.message);
    return {
      success: false,
      error: lastError.message
    };
  }

  async optimizeProductContent(product) {
    try {
      console.log(`Optimizing content for product ${product.title}...`);
      
      // Get the first image for content optimization
      const mainImage = product.images[0];
      const imageBuffer = await this.downloadImage(mainImage.src);
      const base64Image = Buffer.from(imageBuffer).toString('base64');
      
      // Get optimized content from AI
      const contentOptimization = await this.getTitleDescriptionOptimization(
        product.title,
        product.body_html,
        base64Image
      );

      if (contentOptimization.error) {
        console.error(`Error optimizing content for product ${product.id}:`, contentOptimization.error);
        throw new Error(`Content optimization failed: ${contentOptimization.error}`);
      }

      // Update product details in Shopify
      const updateResult = await this.updateProductDetails(
        product.id,
        contentOptimization.title,
        contentOptimization.description
      );

      if (!updateResult.success) {
        throw new Error(`Failed to update product details: ${updateResult.error}`);
      }

      console.log(`✅ Successfully updated title and description for product ${product.id}`);
      return true;
    } catch (error) {
      console.error(`Error in optimizeProductContent for ${product.title}:`, error);
      throw error;
    }
  }

  async optimizeProductImages(product) {
    try {
      console.log(`Processing images for product ${product.id}...`);
      
      // Clear filenames set for new product
      this.currentProductFilenames.clear();
      
      // Process all images
      for (const image of product.images) {
        if (!this.isRunning) return;
        
        this.currentImage = {
          id: image.id,
          src: image.src,
          productId: product.id,
          productTitle: product.title,
          status: 'processing'
        };
        
        // Pass current set of filenames to ensure uniqueness
        const result = await this.processImage(image, product, Array.from(this.currentProductFilenames));
        
        if (result.success && result.newFilename) {
          // Add the new filename to our set
          this.currentProductFilenames.add(result.newFilename);
        }
        
        // Update image with success data
        this.currentImage.status = 'completed';
        this.currentImage.newAltText = result.newAltText;
        this.currentImage.newFilename = result.newFilename;
        this.addToProcessedImages(this.currentImage);
      }
      
      return true;
    } catch (error) {
      console.error(`Error in optimizeProductImages for ${product.title}:`, error);
      throw error;
    }
  }
}

module.exports = SEOService; 