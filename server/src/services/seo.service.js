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
    this.maxProcessedImages = 5;
    this.onProgress = null;
    this.processedProductIds = new Set(); // Track processed product IDs
    
    // Add error tracking
    this.apiErrorCount = 0;
    this.maxApiErrors = 3; // Stop after 3 consecutive API errors
    this.lastError = null;
    this.productsWithErrors = new Set();

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
          processedProductIds: [] // Add this field
        });
        await progress.save();
      }
      return {
        lastProductId: progress.lastProductId,
        completedProducts: progress.completedProducts || 0,
        totalProducts: progress.totalProducts || 0,
        isRunning: progress.isRunning || false,
        processedProductIds: progress.processedProductIds || [], // Return processed IDs
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
        processedProductIds: [],
        currentProductId: null,
        currentProductTitle: null,
        currentImage: null
      };
    }
  }

  // Save progress to database
  async saveProgress(productId) {
    try {
      await Progress.findOneAndUpdate(
        { userId: this.userId },
        { 
          lastProductId: productId,
          completedProducts: this.completedProducts,
          totalProducts: this.totalProducts,
          isRunning: this.isRunning,
          currentProduct: this.currentProduct,
          processedImages: this.processedImages.slice(0, this.maxProcessedImages),
          processedProductIds: Array.from(this.processedProductIds), // Save processed IDs
          updatedAt: new Date()
        },
        { upsert: true }
      );
    } catch (error) {
      console.error("Error saving progress:", error);
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
  async getImageDescription(base64Image, productTitle, productDescription) {
    try {
      const prompt = `
You are an expert in e-commerce SEO and product listing optimization.
Your task is to analyze the given image with respect to its already uploaded product title and its description which is uploaded on shopify and generate:
  1️⃣ AltText: A highly descriptive, SEO-friendly alt text (125 characters max).
  2️⃣ Filename: A short, keyword-rich filename (no spaces, no special characters, no file extension).

### **Guidelines for Alt Text**:
✅ Clearly describe the main subject of the image with respect to its product title and product description 
✅ Include relevant attributes such as **color, material, size, usage, and unique features**.  
✅ Use a natural, human-readable sentence structure.  
✅ Keep it **concise** and **highly relevant** to e-commerce SEO.  
✅ **DO NOT** start with "Image of" or "Picture of".  
✅ **DO NOT** use generic terms like "Product", "Item", or "Photo".  
✅ **DO NOT** add excessive words; focus on what truly matters.

### **Guidelines for Filename**:
✅ Create a **short and keyword-optimized filename**.  
✅ Use **hyphens (-) instead of spaces**.  
✅ Focus on **high-ranking search terms** related to the product.  
✅ **DO NOT** use unnecessary words like "photo", "image", or "screenshot".  
✅ **DO NOT** include the file extension (.jpg, .png, etc.).  
✅ **DO NOT** use special characters, only letters, numbers, and hyphens.

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

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.geminiKey}`,
        {
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
        },
        { headers: { "Content-Type": "application/json" } }
      );

      const textResponse = response.data.candidates[0].content.parts[0].text;
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
      const result = await this.getImageDescription(base64Image, product.title, product.body_html);
      
      if (result.error) {
        return { error: result.error };
      }

      return {
        success: true,
        newAltText: result.altText,
        newFilename: result.fileName
      };
    } catch (error) {
      console.error('AI Generation Error:', error);
      return { error: error.message };
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

      if (!response.data || !response.data.product || !response.data.product.variants) {
        throw new Error('Invalid response from Shopify API when fetching variants');
      }

      return response.data.product.variants;
    } catch (error) {
      console.error("Error fetching product variants:", error.message);
      throw error;
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

  async processImage(image, product) {
    try {
      if (!this.isRunning) {
        return { success: false, error: 'Process stopped' };
      }

      // Download the image for AI processing only
      console.log(`Downloading image ${image.id} for product ${product.id}...`);
      const imageBuffer = await this.downloadImage(image.src);
      if (!imageBuffer) {
        return { success: false, error: 'Failed to download image' };
      }

      // Get AI-generated content
      const result = await this.getAIGeneratedContent(image, product);
      
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

      // Upload a new image with the AI-generated content
      try {
        console.log(`Uploading new image for product ${product.id} with new alt text and filename...`);
        const uploadResult = await this.uploadNewShopifyImage(
          product.id, 
          image,
          result.newAltText, 
          result.newFilename
        );

        // Update current image with new information
        this.currentImage = {
          ...this.currentImage,
          newImageId: uploadResult.newImageId,
          newImageSrc: uploadResult.newImageSrc,
          newAltText: result.newAltText,
          newFilename: result.newFilename,
          status: 'completed'
        };

        // Get all variants for this product
        console.log(`Fetching variants for product ${product.id}...`);
        const variants = await this.getProductVariants(product.id);
        
        // Find variants using the old image
        const variantsUsingOldImage = variants.filter(variant => 
          variant.image_id === parseInt(image.id)
        );
        
        // Update variants to use the new image
        if (variantsUsingOldImage.length > 0) {
          console.log(`Updating ${variantsUsingOldImage.length} variants to use new image...`);
          for (const variant of variantsUsingOldImage) {
            await this.updateVariantImage(product.id, variant.id, uploadResult.newImageId);
          }
        }
        
        // Delete the old image
        console.log(`Deleting old image ${image.id} for product ${product.id}...`);
        await this.deleteShopifyImage(product.id, image.id);

        return {
          success: true,
          newAltText: result.newAltText,
          newFilename: result.newFilename,
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
    // First reset any stale state
    await this.resetState();
    
    if (this.isRunning) return;
    
    // Validate seoTypes
    if (!Array.isArray(seoTypes) || seoTypes.length === 0) {
      throw new Error('Invalid SEO types provided');
    }
    
    console.log('Starting SEO process with types:', seoTypes);
    
    this.isRunning = true;
    this.onProgress = progressCallback;
    this.processedImages = [];
    this.apiErrorCount = 0; // Reset error count on start
    
    try {
      // Load existing progress first
      const existingProgress = await Progress.findOne({ userId: this.userId });
      
      if (startFresh) {
        // Reset progress in database
        this.processedProductIds.clear();
        await Progress.findOneAndUpdate(
          { userId: this.userId },
          { 
            lastProductId: null,
            currentProductId: null,
            currentProductTitle: null,
            completedProducts: 0,
            totalProducts: 0,
            isRunning: true,
            startedAt: new Date(),
            processedProductIds: [], // Clear processed products only if startFresh is true
            productsWithErrors: [], // Clear errors too when starting fresh
            seoTypes: seoTypes // Store the SEO types in progress
          },
          { upsert: true }
        );
        console.log('🔄 Starting fresh: Reset progress in database');
      } else {
        // Load existing processed products if not starting fresh
        if (existingProgress?.processedProductIds) {
          this.processedProductIds = new Set(existingProgress.processedProductIds);
          console.log(`📝 Loaded ${this.processedProductIds.size} previously completed products`);
        }
        
        // Update SEO types in progress
        await Progress.findOneAndUpdate(
          { userId: this.userId },
          { $set: { seoTypes: seoTypes } }
        );
      }

      const products = await this.fetchProducts();
      this.totalProducts = products.length;
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
          processedProductIds: Array.from(this.processedProductIds) // Ensure we preserve existing completed products
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
        
        // Update progress after each product
        await Progress.findOneAndUpdate(
          { userId: this.userId },
          { 
            completedProducts: this.completedProducts,
            processedProductIds: Array.from(this.processedProductIds),
            currentProductId: product.id,
            currentProductTitle: product.title,
            seoTypes: seoTypes // Ensure SEO types are stored
          }
        );
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

  async processProduct(product, seoTypes) {
    try {
      if (!this.isRunning) return;
      
      // Validate seoTypes at the start of processing
      if (!Array.isArray(seoTypes) || seoTypes.length === 0) {
        throw new Error('Invalid SEO types provided to processProduct');
      }
      
      console.log(`Processing product ${product.id} with SEO types:`, seoTypes);
      
      // Store only necessary product information
      this.currentProduct = {
        id: product.id,
        title: product.title,
        imageCount: product.images?.length || 0,
        seoTypes: seoTypes // Track which types are being processed
      };
      
      this.updateProgress();

      // Only process title and description if 'content' type is selected AND 'images' is NOT selected
      if (seoTypes.includes('content') && !seoTypes.includes('images')) {
        console.log(`Optimizing only title and description for product ${product.id}...`);
        
        // Use the first image for content optimization
        const mainImage = product.images[0];
        const imageBuffer = await this.downloadImage(mainImage.src);
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        
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
      }

      // Only process images if 'images' type is selected AND 'content' is NOT selected
      if (seoTypes.includes('images') && !seoTypes.includes('content')) {
        console.log(`Processing only images for product ${product.id}...`);
        
        for (const image of product.images) {
          if (!this.isRunning) return;
          
          this.currentImage = {
            id: image.id,
            src: image.src,
            productId: product.id,
            productTitle: product.title,
            status: 'processing'
          };
          
          const result = await this.processImage(image, product);
          
          if (!result.success) {
            if (result.apiKeyError) {
              this.currentImage.status = 'error';
              this.currentImage.error = 'API key error';
              this.addToProcessedImages(this.currentImage);
              return;
            }
            this.currentImage.status = 'error';
            this.currentImage.error = result.error;
            this.addToProcessedImages(this.currentImage);
            continue;
          }
          
          // Update image with success data
          this.currentImage.status = 'completed';
          this.currentImage.newAltText = result.newAltText;
          this.currentImage.newFilename = result.newFilename;
          this.addToProcessedImages(this.currentImage);
        }
      }

      // Process both if both types are selected
      if (seoTypes.includes('images') && seoTypes.includes('content')) {
        console.log(`Processing both content and images for product ${product.id}...`);
        
        // First optimize title and description
        const mainImage = product.images[0];
        const imageBuffer = await this.downloadImage(mainImage.src);
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        
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

        // Then process all images
        for (const image of product.images) {
          if (!this.isRunning) return;
          
          this.currentImage = {
            id: image.id,
            src: image.src,
            productId: product.id,
            productTitle: contentOptimization.title, // Use the optimized title
            status: 'processing'
          };
          
          const result = await this.processImage(image, {
            ...product,
            title: contentOptimization.title,
            body_html: contentOptimization.description
          });
          
          if (!result.success) {
            if (result.apiKeyError) {
              this.currentImage.status = 'error';
              this.currentImage.error = 'API key error';
              this.addToProcessedImages(this.currentImage);
              return;
            }
            this.currentImage.status = 'error';
            this.currentImage.error = result.error;
            this.addToProcessedImages(this.currentImage);
            continue;
          }
          
          // Update image with success data
          this.currentImage.status = 'completed';
          this.currentImage.newAltText = result.newAltText;
          this.currentImage.newFilename = result.newFilename;
          this.addToProcessedImages(this.currentImage);
        }
      }
      
      // Mark product as completed
      this.processedProductIds.add(product.id);
      this.completedProducts++;
      
      // Update completion time in database
      await Progress.findOneAndUpdate(
        { userId: this.userId },
        { 
          $set: { 
            [`productCompletionTimes.${product.id}`]: new Date(),
            completedProducts: this.completedProducts,
            processedProductIds: Array.from(this.processedProductIds),
            [`optimizationDetails.${product.id}`]: {
              completedAt: new Date(),
              seoTypes: seoTypes,
              status: 'completed'
            }
          }
        }
      );
      
      // Clear current product and image
      this.currentProduct = null;
      this.currentImage = null;
      this.updateProgress();
      
    } catch (error) {
      console.error('Process Product Error:', error);
      this.productsWithErrors.add(product.id);
      await Progress.findOneAndUpdate(
        { userId: this.userId },
        { 
          $addToSet: { productsWithErrors: product.id },
          $set: {
            [`optimizationDetails.${product.id}`]: {
              completedAt: new Date(),
              seoTypes: seoTypes,
              status: 'error',
              error: error.message
            }
          }
        }
      );
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

    this.processedImages.unshift(processedImage);
    if (this.processedImages.length > this.maxProcessedImages) {
      this.processedImages.pop();
    }
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
}

module.exports = SEOService; 